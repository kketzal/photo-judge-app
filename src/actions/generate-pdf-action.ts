
// src/actions/generate-pdf-action.ts

'use server';

import type { ActionSerializableRankedImage } from '@/types';
import { PDFDocument, rgb, StandardFonts, PageSizes, PDFFont, PDFImage } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

async function loadAndEmbedImage(pdfDoc: PDFDocument, imagePath: string): Promise<PDFImage | null> {
  try {
    const imageBytes = await fs.readFile(imagePath);
    if (imagePath.endsWith('.png')) {
      return await pdfDoc.embedPng(imageBytes);
    } else if (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')) {
      return await pdfDoc.embedJpg(imageBytes);
    }
    console.warn(`Unsupported image format for PDF embedding: ${imagePath}`);
    return null;
  } catch (e) {
    console.warn(`Image not found or could not be embedded: ${imagePath}`, e);
    return null;
  }
}

export async function generateRankingPdf(
  images: ActionSerializableRankedImage[],
  reportTitle?: string,
  hideObservationsColumn: boolean = false,
  mainNameColumnTitle: string = "Nombre de Imagen",
  imageNameColumnTitle?: string // New optional parameter for the image name column
): Promise<string> {
  let currentImageForDebug: ActionSerializableRankedImage | null = null;
  try {
    const pdfDoc = await PDFDocument.create();
    const pageDimensions = PageSizes.A4.reverse(); // Landscape A4: [841.89, 595.28]

    let currentPage = pdfDoc.addPage(pageDimensions);
    const { width, height } = currentPage.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 30;
    const footerHeight = 50;
    const headerTopMargin = 30;
    const contentTopInitialY = height - headerTopMargin;
    const contentBottomLimit = margin + footerHeight;


    const lineHeight = 12; 
    const fontSize = 8;
    const titleFontSize = 14;
    const footerFontSize = 7;

    // Load logos
    const iquemaLogoPath = path.join(process.cwd(), 'public', 'logo-iquema-uco.png');
    const embeddedIquemaLogo = await loadAndEmbedImage(pdfDoc, iquemaLogoPath);

    const scaiLogoPath = path.join(process.cwd(), 'public', 'favicon_logo_scai.png');
    const embeddedScaiLogo = await loadAndEmbedImage(pdfDoc, scaiLogoPath);

    // Column X positions and widths
    const xRank = margin;
    const rankColWidth = 30;
    
    const xMainName = xRank + rankColWidth + 5;
    // Adjust mainNameColWidth if imageNameColumn is present
    const mainNameColWidth = imageNameColumnTitle ? 120 : 150; 
    
    const xImageName = imageNameColumnTitle ? xMainName + mainNameColWidth + 10 : 0;
    const imageNameColWidth = imageNameColumnTitle ? 120 : 0;

    const scoreColWidth = 70;
    const xArtistic = (imageNameColumnTitle ? xImageName + imageNameColWidth : xMainName + mainNameColWidth) + 10;
    const xContext = xArtistic + scoreColWidth + 10;
    const xOriginality = xContext + scoreColWidth + 10;
    const xTotal = xOriginality + scoreColWidth + 10;
    const totalScoreColWidth = 70;
    
    let xObservations: number;
    let observationsColWidth: number;

    if (hideObservationsColumn) {
      xObservations = 0; // Not used
      observationsColWidth = 0; // No width
    } else {
      xObservations = xTotal + totalScoreColWidth + 10;
      observationsColWidth = width - xObservations - margin; 
    }


    const drawPageFooter = (page: import('pdf-lib').PDFPage) => {
      const footerY = margin + 15;
      let currentX = margin;

      if (embeddedScaiLogo) {
        const logoDims = embeddedScaiLogo.scale(0.20); 
        page.drawImage(embeddedScaiLogo, {
          x: currentX,
          y: footerY - logoDims.height / 2,
          width: logoDims.width,
          height: logoDims.height,
        });
        currentX += logoDims.width + 5;
      }

      const copyrightText = `© ${new Date().getFullYear()} PhotoJudge. Creado por MMP. Unidad de Fotografía Científica del SCAI. Universidad de Córdoba.`;
      page.drawText(copyrightText, {
        x: currentX,
        y: footerY,
        font: font,
        size: footerFontSize,
        color: rgb(0.3, 0.3, 0.3),
      });

      const pageNumText = `${pdfDoc.getPageCount()}`;
      const pageNumWidth = font.widthOfTextAtSize(pageNumText, footerFontSize);
      page.drawText(pageNumText, {
        x: width - margin - pageNumWidth,
        y: footerY,
        font: font,
        size: footerFontSize,
        color: rgb(0.3,0.3,0.3)
      });
    };

    const drawPageHeaders = (page: import('pdf-lib').PDFPage, initialY: number) => {
      let headerY = initialY;
      const logoLeftMargin = margin;
      let textXOffset = logoLeftMargin;

      if (embeddedIquemaLogo) {
        const logoDims = embeddedIquemaLogo.scale(0.15);
        page.drawImage(embeddedIquemaLogo, {
          x: logoLeftMargin,
          y: headerY - logoDims.height,
          width: logoDims.width,
          height: logoDims.height,
        });
        textXOffset += logoDims.width + 10;
      }
      
      const defaultMainTitle = "IV Premio Bienal Nacional de Fotografía Científica del IQUEMA - Ranking de Clasificación";
      const mainTitleText = reportTitle || defaultMainTitle;
      page.drawText(mainTitleText, {
        x: textXOffset,
        y: headerY - titleFontSize * 0.8,
        font: boldFont,
        size: titleFontSize,
        color: rgb(0, 0.2, 0.4),
      });
      headerY -= titleFontSize + lineHeight * 0.8; 
      headerY -= lineHeight; 


      page.drawText('Rank', { x: xRank, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      page.drawText(mainNameColumnTitle, { x: xMainName, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      if (imageNameColumnTitle) {
        page.drawText(imageNameColumnTitle, { x: xImageName, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      }
      page.drawText('Cal. Artística', { x: xArtistic, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      page.drawText('Context.', { x: xContext, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      page.drawText('Originalidad', { x: xOriginality, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      page.drawText('Total', { x: xTotal, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      if (!hideObservationsColumn) {
        page.drawText('Observaciones', { x: xObservations, y: headerY, font: boldFont, size: fontSize, color: rgb(0,0,0) });
      }
      
      headerY -= lineHeight * 1.2; // Space after table headers
      return headerY; // This is the Y where content (first image row) should start
    };

    let y = drawPageHeaders(currentPage, contentTopInitialY);
    drawPageFooter(currentPage);

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      currentImageForDebug = image; 
      const rank = i + 1;

      if (y < contentBottomLimit + lineHeight) { 
        currentPage = pdfDoc.addPage(pageDimensions);
        y = drawPageHeaders(currentPage, contentTopInitialY);
        drawPageFooter(currentPage);
      }

      // Main name (contestant or image name)
      let mainNameToDraw = imageNameColumnTitle ? image.name.toUpperCase() : image.name; // Uppercase if it's contestant name for avg PDF
      let mainNameWidth = font.widthOfTextAtSize(mainNameToDraw, fontSize);
      if (mainNameWidth > mainNameColWidth) {
        while (mainNameWidth > mainNameColWidth && mainNameToDraw.length > 0) {
          mainNameToDraw = mainNameToDraw.slice(0, -1);
          mainNameWidth = font.widthOfTextAtSize(mainNameToDraw + "...", fontSize);
        }
         if (image.name.length > mainNameToDraw.length && mainNameToDraw.length > 3) {
             mainNameToDraw = mainNameToDraw.slice(0, -3) + "...";
         } else if (image.name.length > mainNameToDraw.length) {
            mainNameToDraw = "..."; 
         }
      }

      // Actual image name (if imageNameColumnTitle is provided)
      let actualImageNameToDraw = "";
      if (imageNameColumnTitle) {
        const parts = image.id.split('/');
        actualImageNameToDraw = parts.length > 0 ? parts[parts.length - 1] : image.id;
        let actualImageNameWidth = font.widthOfTextAtSize(actualImageNameToDraw, fontSize);
        if (actualImageNameWidth > imageNameColWidth) {
          while (actualImageNameWidth > imageNameColWidth && actualImageNameToDraw.length > 0) {
            actualImageNameToDraw = actualImageNameToDraw.slice(0, -1);
            actualImageNameWidth = font.widthOfTextAtSize(actualImageNameToDraw + "...", fontSize);
          }
          if (parts[parts.length -1].length > actualImageNameToDraw.length && actualImageNameToDraw.length > 3) {
            actualImageNameToDraw = actualImageNameToDraw.slice(0, -3) + "...";
          } else if (parts[parts.length -1].length > actualImageNameToDraw.length) {
            actualImageNameToDraw = "...";
          }
        }
      }
      
      currentPage.drawText(String(rank), { x: xRank, y: y, font: font, size: fontSize, color: rgb(0,0,0) });
      currentPage.drawText(mainNameToDraw, { x: xMainName, y: y, font: font, size: fontSize, color: rgb(0,0,0) });
      if (imageNameColumnTitle) {
        currentPage.drawText(actualImageNameToDraw, { x: xImageName, y: y, font: font, size: fontSize, color: rgb(0,0,0) });
      }
      currentPage.drawText(String(image.scores.artisticQuality.toFixed(0)), { x: xArtistic, y: y, font: font, size: fontSize, color: rgb(0,0,0) });
      currentPage.drawText(String(image.scores.contextualization.toFixed(0)), { x: xContext, y: y, font: font, size: fontSize, color: rgb(0,0,0) });
      currentPage.drawText(String(image.scores.originality.toFixed(0)), { x: xOriginality, y: y, font: font, size: fontSize, color: rgb(0,0,0) });
      currentPage.drawText(String(image.totalScore.toFixed(0)), { x: xTotal, y: y, font: font, size: fontSize, color: rgb(0,0,0) });

      let obsLinesDrawnThisImage = 0;
      if (!hideObservationsColumn) {
        const observationsText = image.observations || "";
        let yForCurrentObs = y; 

        if (observationsText) {
          const mainObservationLines = observationsText.split('\n');

          for (const mainObsLine of mainObservationLines) {
              const words = mainObsLine.split(' ');
              let lineFragment = '';
              for (const word of words) {
                  const testLineFragment = lineFragment + (lineFragment ? ' ' : '') + word;
                  if (font.widthOfTextAtSize(testLineFragment, fontSize) > observationsColWidth && lineFragment) {
                      
                      if (yForCurrentObs < contentBottomLimit + lineHeight) {
                          currentPage = pdfDoc.addPage(pageDimensions);
                          yForCurrentObs = drawPageHeaders(currentPage, contentTopInitialY);
                          drawPageFooter(currentPage);
                          
                          currentPage.drawText(String(rank), { x: xRank, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                          currentPage.drawText(mainNameToDraw, { x: xMainName, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                          if (imageNameColumnTitle) {
                            currentPage.drawText(actualImageNameToDraw, { x: xImageName, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                          }
                          currentPage.drawText(String(image.scores.artisticQuality.toFixed(0)), { x: xArtistic, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                          currentPage.drawText(String(image.scores.contextualization.toFixed(0)), { x: xContext, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                          currentPage.drawText(String(image.scores.originality.toFixed(0)), { x: xOriginality, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                          currentPage.drawText(String(image.totalScore.toFixed(0)), { x: xTotal, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                      }
                      currentPage.drawText(lineFragment, { x: xObservations, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                      yForCurrentObs -= lineHeight;
                      obsLinesDrawnThisImage++;
                      lineFragment = word;
                  } else {
                      lineFragment = testLineFragment;
                  }
              }
              
              if (lineFragment) {
                   if (yForCurrentObs < contentBottomLimit + lineHeight) { 
                        currentPage = pdfDoc.addPage(pageDimensions);
                        yForCurrentObs = drawPageHeaders(currentPage, contentTopInitialY);
                        drawPageFooter(currentPage);
                        currentPage.drawText(String(rank), { x: xRank, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                        currentPage.drawText(mainNameToDraw, { x: xMainName, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                        if (imageNameColumnTitle) {
                            currentPage.drawText(actualImageNameToDraw, { x: xImageName, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                        }
                        currentPage.drawText(String(image.scores.artisticQuality.toFixed(0)), { x: xArtistic, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                        currentPage.drawText(String(image.scores.contextualization.toFixed(0)), { x: xContext, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                        currentPage.drawText(String(image.scores.originality.toFixed(0)), { x: xOriginality, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                        currentPage.drawText(String(image.totalScore.toFixed(0)), { x: xTotal, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                    }
                  currentPage.drawText(lineFragment, { x: xObservations, y: yForCurrentObs, font, size: fontSize, color: rgb(0,0,0) });
                  
                  if (mainObsLine !== mainObservationLines[mainObservationLines.length - 1] || obsLinesDrawnThisImage > 0 || mainObservationLines.length > 1) {
                     yForCurrentObs -= lineHeight;
                  }
                  obsLinesDrawnThisImage++;
              }
          }
        }
         
         if (obsLinesDrawnThisImage > 0) {
            
            if (obsLinesDrawnThisImage === 1 && yForCurrentObs === y) { 
                y -= lineHeight; 
            } else {
                y = yForCurrentObs; 
                
                if (obsLinesDrawnThisImage > 0 && yForCurrentObs < y) { 
                    // y already updated by drawing observations on multiple lines
                } else { 
                     y = y - lineHeight; 
                }
            }
          } else { 
            y -= lineHeight; 
          }
      } else { 
         y -= lineHeight; 
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes).toString('base64');
  } catch (error: any) {
    let originalErrorMessage = "Unknown error";
    if (error instanceof Error) {
      originalErrorMessage = error.message;
    } else if (typeof error === 'string') {
      originalErrorMessage = error;
    }

    console.error(
      "Error generating PDF. Current image being processed (if available):", 
      currentImageForDebug ? 
      { id: currentImageForDebug.id, name: currentImageForDebug.name, observations: currentImageForDebug.observations } : 
      "N/A"
    );
    console.error("Full error details:", error);
    // Normalize the error message to NFC to prevent encoding issues with certain characters
    const normalizedErrorMessage = originalErrorMessage.normalize('NFC');
    throw new Error(`Failed to generate PDF: ${normalizedErrorMessage}. Check server logs for details.`);
  }
}
