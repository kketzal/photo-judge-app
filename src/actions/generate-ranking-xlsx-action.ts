
'use server';

import type { ActionSerializableRankedImage } from '@/types';
import * as XLSX from 'xlsx';

export async function generateRankingXlsx(images: ActionSerializableRankedImage[]): Promise<string> {
  try {
    const headers = [
      "ID (Clave de Ordenación)", // This ID should be the originalPath
      "Nombre de Imagen",
      "Calidad Artística (pts)",
      "Contextualización (pts)",
      "Originalidad (pts)",
      "Puntuación Total (pts)",
      "Observaciones" 
    ];

    const data = images.map((image, index) => {
      if (!image) {
        console.warn(`XLSX Generation: Encountered a null/undefined image object at index ${index}. Using placeholder data for this row.`);
        return [
          `ID Desconocido (Fila ${index + 1})`,      
          "Nombre Desconocido",  
          0,                     
          0,                     
          0,                     
          0,
          ""                     
        ];
      }

      // image.id is now the canonical originalPath
      const id = typeof image.id === 'string' ? image.id : String(image.id ?? `Generado_ID_Ruta_Desconocida_${index}`);
      const name = typeof image.name === 'string' ? image.name : String(image.name ?? "Nombre Desconocido");
      const observations = image.observations || ""; 

      const parseScore = (scoreValue: any, scoreName: string): number => {
        const strValue = String(scoreValue);
        if (strValue === "null" || strValue === "undefined" || strValue.trim() === "") {
            console.warn(`XLSX Generation: score '${scoreName}' for image '${name}' (ID: ${id}) is null, undefined, or empty. Defaulting to 0.`);
            return 0;
        }
        const num = parseFloat(strValue);
        if (isNaN(num) || !isFinite(num)) {
          console.warn(`XLSX Generation: score '${scoreName}' for image '${name}' (ID: ${id}) is not a valid number ('${scoreValue}'). Defaulting to 0.`);
          return 0;
        }
        return Number(num.toFixed(0)); 
      };
      
      let artisticQuality = 0;
      let contextualization = 0;
      let originality = 0;
      let calculatedTotalScore = 0;

      if (image.scores && typeof image.scores === 'object') {
        artisticQuality = parseScore(image.scores.artisticQuality, 'artisticQuality');
        contextualization = parseScore(image.scores.contextualization, 'contextualization');
        originality = parseScore(image.scores.originality, 'originality');
        calculatedTotalScore = artisticQuality + contextualization + originality;
      } else {
        console.warn(`XLSX Generation: 'scores' object is missing or not an object for image '${name}' (ID: ${id}). Attempting to use 'totalScore'.`);
        calculatedTotalScore = parseScore(image.totalScore, 'totalScore (fallback)');
      }
      
      return [
        id, // This is the originalPath
        name,
        artisticQuality,
        contextualization,
        originality,
        calculatedTotalScore,
        observations 
      ];
    });

    const worksheetData = [headers, ...data];
    
    if (worksheetData.length <= 1 && images.length > 0) { 
        console.warn("XLSX generation: No valid data rows were generated from the input images, though images were present. The Excel file might be empty or only contain headers.");
    } else if (images.length === 0) {
        console.info("XLSX generation: Input 'images' array is empty. Generating Excel with only headers.");
    }


    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    if (!worksheet) {
        console.error("XLSX generation: Failed to create worksheet object from data. This is unexpected. Data that was passed:", JSON.stringify(worksheetData));
        throw new Error("Internal error: Failed to create worksheet from data.");
    }

    const columnWidths = [
        { wch: 60 }, 
        { wch: 40 }, 
        { wch: 20 }, 
        { wch: 20 }, 
        { wch: 20 }, 
        { wch: 20 },
        { wch: 50 }  
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ranking de Fotografías");

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    
    if (!buffer || buffer.length === 0) {
      console.error("XLSX generation: XLSX.write returned an empty or null buffer.");
      throw new Error("Internal error: Failed to write workbook to buffer.");
    }

    return Buffer.from(buffer).toString('base64');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Detailed error generating XLSX:", error instanceof Error ? error.stack : String(error));
    throw new Error(`Failed to generate XLSX: ${errorMessage}. Check server logs for full details.`);
  }
}

