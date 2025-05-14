// src/actions/generate-pdf-action.ts

'use server';

import type { ActionSerializableRankedImage } from '@/types';
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';

export async function generateRankingPdf(
  images: ActionSerializableRankedImage[],
  reportTitle: string = 'Ranking de Fotos',
  hideObservationsColumn: boolean = false,
  mainNameColumnTitle: string = "Nombre de Imagen",
  imageNameColumnTitle?: string
): Promise<Uint8Array> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Load standard fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add a new page
    const page = pdfDoc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    const margin = 50;
    const availableWidth = width - 2 * margin;
    
    // Draw report title
    const titleFontSize = 20;
    page.drawText(reportTitle, {
      x: margin,
      y: height - margin - titleFontSize,
      size: titleFontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Draw generation date
    const dateText = `Generado el: ${new Date().toLocaleDateString()}`;
    const dateFontSize = 10;
    page.drawText(dateText, {
      x: margin,
      y: height - margin - titleFontSize - 20,
      size: dateFontSize,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Table configuration
    const tableTop = height - margin - 60;
    const rowHeight = 20;
    const columnCount = imageNameColumnTitle ? (hideObservationsColumn ? 3 : 4) : (hideObservationsColumn ? 2 : 3);
    const colWidth = availableWidth / columnCount;
    
    // Table headers
    const headers = ['Posición', mainNameColumnTitle];
    if (imageNameColumnTitle) {
      headers.push(imageNameColumnTitle);
    }
    headers.push('Puntuación');
    if (!hideObservationsColumn) {
      headers.push('Observaciones');
    }
    
    // Draw column headers
    headers.forEach((header, i) => {
      page.drawText(header, {
        x: margin + (i * colWidth) + 5,
        y: tableTop,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    });
    
    // Draw header underline
    page.drawLine({
      start: { x: margin, y: tableTop - 5 },
      end: { x: width - margin, y: tableTop - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    // Draw table rows
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const y = tableTop - ((i + 1) * rowHeight);
      
      // Position
      page.drawText((i + 1).toString(), {
        x: margin + 5,
        y: y,
        size: 9,
        font: font,
      });
      
      // Name (truncated if needed)
      const name = image.name.length > 20 ? `${image.name.substring(0, 20)}...` : image.name;
      page.drawText(name, {
        x: margin + colWidth + 5,
        y: y,
        size: 9,
        font: font,
      });
      
      // Image name (if available)
      let currentCol = 2;
      if (imageNameColumnTitle) {
        const imgName = image.imageName ? (image.imageName.length > 20 ? `${image.imageName.substring(0, 20)}...` : image.imageName) : '-';
        page.drawText(imgName, {
          x: margin + (currentCol * colWidth) + 5,
          y: y,
          size: 9,
          font: font,
        });
        currentCol++;
      }
      
      // Score
      page.drawText(image.score.toFixed(2), {
        x: margin + (currentCol * colWidth) + 5,
        y: y,
        size: 9,
        font: font,
      });
      currentCol++;
      
      // Observations (if enabled)
      if (!hideObservationsColumn) {
        const observationsText = image.observations || '-';
        
        // Handle multi-line observations
        const observationsLines = observationsText.split('\n');
        let currentY = y;
        
        for (const line of observationsLines) {
          page.drawText(line, {
            x: margin + (currentCol * colWidth) + 5,
            y: currentY,
            size: 9,
            font: font,
            maxWidth: colWidth - 10,
          });
          currentY -= 12; // Adjust line spacing
        }
      }
      
      // Row separator
      if (i < images.length - 1) {
        page.drawLine({
          start: { x: margin, y: y - 5 },
          end: { x: width - margin, y: y - 5 },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });
      }
    }
    
    // Add page number
    const pageNumber = `Página 1`;
    const pageNumberWidth = font.widthOfTextAtSize(pageNumber, 10);
    page.drawText(pageNumber, {
      x: width - margin - pageNumberWidth,
      y: margin / 2,
      size: 9,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Save the PDF
    return await pdfDoc.save();
    
  } catch (error) {
    console.error('Error al generar el PDF:', error);
    throw new Error('No se pudo generar el PDF');
  }
}
