
'use client';

import { useState, useCallback, useMemo, ChangeEvent, useEffect } from 'react';
import type { RankedImage, ImageScore, ActionSerializableRankedImage } from '@/types';
import Image from "next/legacy/image";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageCard } from '@/components/image-card';
import { ImageRatingModal } from '@/components/image-rating-modal';
import { PdfViewerModal } from '@/components/pdf-viewer-modal';
import { RankingListItem } from '@/components/ranking-list-item';
import { FolderOpen, ListOrdered, ImageIcon, Loader2, FileDown, FileSpreadsheet, FileUp, RotateCcw, Users,FileArchive } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { generateRankingPdf } from '@/actions/generate-pdf-action';
import { generateRankingXlsx } from '@/actions/generate-ranking-xlsx-action';
import * as XLSX from 'xlsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as db from '@/lib/indexed-db';
import { convertTiffAndBmpToPngIfNecessary, type ConvertedImageInfo } from '@/lib/image-converter';
import { getCanonicalImagePath } from '@/lib/utils';


// Converts RankedImage to ActionSerializableRankedImage for server actions (PDF/XLSX)
const toActionSerializable = (image: RankedImage): ActionSerializableRankedImage => {
  return {
    id: image.id, 
    name: image.name,
    url: image.url && (image.url.startsWith('data:') || image.url.startsWith('http:')) ? image.url : undefined,
    scores: image.scores,
    totalScore: image.totalScore,
    observations: image.observations,
  };
};


export default function HomePage() {
  const [images, setImages] = useState<RankedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<RankedImage | null>(null);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [isImportingXlsx, setIsImportingXlsx] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingXlsx, setIsDownloadingXlsx] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const { toast } = useToast();
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(true);

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);
  


  // State for multi-judge functionality
  const [judgeFilesData, setJudgeFilesData] = useState<Array<RankedImage[] | null>>([null, null, null]);
  const [importingJudgeIndex, setImportingJudgeIndex] = useState<number | null>(null);
  const [isGeneratingAveragePdf, setIsGeneratingAveragePdf] = useState(false);
  const [isGeneratingAverageXlsx, setIsGeneratingAverageXlsx] = useState(false);


  useEffect(() => {
    const loadImagesFromDb = async () => {
      setIsLoadingFromDb(true);
      try {
        const storedDbImages = await db.getAllImages();
        const loadedImagesFromDb: RankedImage[] = storedDbImages.map(dbImg => ({
          ...dbImg,
          id: dbImg.id, // ID is now the canonical originalPath
          originalPath: dbImg.originalPath || dbImg.id, // Ensure originalPath is populated, fallback to id if it was missing
          url: (dbImg.url && (dbImg.url.startsWith('data:') || dbImg.url.startsWith('http'))) ? dbImg.url : "",
          file: dbImg.file, 
          pdfFile: dbImg.pdfFile,
          error: dbImg.error,
          observations: (dbImg.observations || '').normalize('NFC'), // Ensure observations from DB are also normalized
        }));
        
        // Sort by originalPath (which is also the ID)
        loadedImagesFromDb.sort((a, b) => (a.id || '').localeCompare(b.id || ''));


        if (loadedImagesFromDb.length > 0) {
          setImages(loadedImagesFromDb);
          const hasMissingPreviews = loadedImagesFromDb.some(img => !img.url && !img.file && !img.error);
          const filesWithErrors = loadedImagesFromDb.filter(img => img.error);

          if (filesWithErrors.length > 0) {
            setTimeout(() => toast({
              title: "Sesión Restaurada con Advertencias",
              description: `${loadedImagesFromDb.length} valoraciones cargadas. ${filesWithErrors.length} imágen(es) tuvieron problemas de carga/conversión. Revise la galería.`,
              duration: 9000,
            }),0);
          } else if (hasMissingPreviews) {
             setTimeout(() => toast({
              title: "Sesión Parcialmente Restaurada",
              description: `${loadedImagesFromDb.length} valoraciones cargadas. Algunas previsualizaciones pueden faltar si los archivos originales no están o si la importación de Excel fue sin seleccionar carpeta.`,
              duration: 9000,
            }),0);
          } else {
            setTimeout(() => toast({
              title: "Sesión Anterior Restaurada",
              description: `${loadedImagesFromDb.length} imágenes y sus valoraciones han sido cargadas desde IndexedDB.`,
            }),0);
          }
        }
      } catch (error) {
        console.error("Error al cargar imágenes de IndexedDB:", error);
        setTimeout(() => toast({
          title: "Error al Restaurar Sesión",
          description: "No se pudieron cargar las valoraciones guardadas de IndexedDB. Los datos podrían estar corruptos.",
          variant: "destructive",
        }),0);
      } finally {
        setIsLoadedFromDb(true);
        setIsLoadingFromDb(false);
      }
    };
    loadImagesFromDb();
  }, [toast]);


  const handleFolderSelect = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const allUploadedFiles = event.target.files;
    if (!allUploadedFiles || allUploadedFiles.length === 0) return;

    setIsLoadingFolder(true);
    let initialImageFiles = Array.from(allUploadedFiles).filter(file =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/bmp'].includes(file.type.toLowerCase())
    );

    if (initialImageFiles.length === 0) {
      setTimeout(() => toast({
        title: "No se Encontraron Imágenes",
        description: "La carpeta seleccionada no contiene archivos de imagen compatibles (JPG, PNG, WEBP, GIF, TIFF, BMP).",
        variant: "destructive",
      }),0);
      setIsLoadingFolder(false);
      return;
    }
    
    const pdfFilesByDirMap = new Map<string, File>();
    Array.from(allUploadedFiles).forEach(file => {
      if (file.type.toLowerCase() === 'application/pdf') {
        const relativePath = file.webkitRelativePath || file.name;
        // Use canonical path (forward slashes) and lowercase for map key to ensure consistent matching
        const canonicalDirPathForMapKey = getCanonicalImagePath(relativePath.substring(0, relativePath.lastIndexOf('/') + 1)).toLowerCase();
        
        if (!pdfFilesByDirMap.has(canonicalDirPathForMapKey)) {
          pdfFilesByDirMap.set(canonicalDirPathForMapKey, file);
        } else {
          console.warn(`PDF Association: Multiple PDFs found in directory '${canonicalDirPathForMapKey}'. Using already stored: ${pdfFilesByDirMap.get(canonicalDirPathForMapKey)!.name}. Ignoring: ${file.name}`);
        }
      }
    });


    const groups = new Map<string, { tiffFiles: File[], nonTiffFiles: File[] }>();
    initialImageFiles.forEach(file => {
      const relativePath = file.webkitRelativePath || file.name;
      const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/') + 1); // Preserves original casing for dirPath initially
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name; // Preserves original casing for baseName
      // Group key uses canonical path for directory (original casing) and lowercase basename for case-insensitive grouping by name
      const groupKey = `${getCanonicalImagePath(dirPath)}${baseName.toLowerCase()}`;


      const group = groups.get(groupKey) || { tiffFiles: [], nonTiffFiles: [] };
      if (file.type.toLowerCase() === 'image/tiff') {
        group.tiffFiles.push(file);
      } else {
        group.nonTiffFiles.push(file);
      }
      groups.set(groupKey, group);
    });

    const deduplicatedImageFiles: File[] = [];
    const discardedTiffMessages: string[] = [];

    for (const [groupKey, groupData] of groups.entries()) {
      const baseNameFromKey = groupKey.substring(groupKey.lastIndexOf('/') + 1); 
      if (groupData.nonTiffFiles.length > 0) {
        deduplicatedImageFiles.push(...groupData.nonTiffFiles);
        if (groupData.tiffFiles.length > 0) {
          const tiffNames = groupData.tiffFiles.map(f => f.name).join(', ');
          const exampleNonTiffName = groupData.nonTiffFiles[0].name;
          discardedTiffMessages.push(`"${tiffNames}" (TIFF) fue descartado en favor de versiones no TIFF como "${exampleNonTiffName}" para el nombre base "${baseNameFromKey}".`);
        }
      } else if (groupData.tiffFiles.length > 0) {
        // Only TIFF files exist for this base name, so add them
        deduplicatedImageFiles.push(...groupData.tiffFiles);
      }
    }
    
    if (discardedTiffMessages.length > 0) {
        setTimeout(() => toast({
            title: "Archivos TIFF Descartados",
            description: `${discardedTiffMessages.length} archivo(s) TIFF fueron descartados por existir versiones no TIFF. Detalles: ${discardedTiffMessages.join(' ')}`,
            duration: 10000,
        }), 0);
    }
    
    // Sort by original webkitRelativePath (preserving casing, canonicalized) to ensure consistent processing order.
    deduplicatedImageFiles.sort((a, b) => 
        getCanonicalImagePath(a.webkitRelativePath || a.name).localeCompare(getCanonicalImagePath(b.webkitRelativePath || b.name))
    );

    const conversionResults = await convertTiffAndBmpToPngIfNecessary(deduplicatedImageFiles);
    
    const loadedImagesFromFolder: RankedImage[] = [];
    const conversionErrorDetails: { name: string; path: string; error: string }[] = [];

    for (const result of conversionResults) {
      // result.originalPath is already canonical (original case, forward slashes)
      const imageId = result.originalPath; 
      
      // Key for PDF map lookup uses canonical path (forward slashes) and lowercase
      const canonicalImageDirPathForMapKey = getCanonicalImagePath(result.originalPath.substring(0, result.originalPath.lastIndexOf('/') + 1)).toLowerCase();
      const associatedPdfFile = pdfFilesByDirMap.get(canonicalImageDirPathForMapKey);


      if (result.error) {
        conversionErrorDetails.push({ name: result.originalName, path: result.originalPath, error: result.error });
      }
      loadedImagesFromFolder.push({
        id: imageId, 
        name: result.originalName.normalize('NFC'), // Normalize name
        originalPath: result.originalPath, // Canonical original path (original casing, forward slashes)
        url: result.dataUrl || "", // dataUrl if conversion happened, else empty
        file: result.file, // original File object, or converted File object
        pdfFile: associatedPdfFile,
        scores: { artisticQuality: 0, contextualization: 0, originality: 0 },
        totalScore: 0,
        error: result.error, // Error message if conversion failed
        observations: '', // Initially empty, will be normalized on change
      });
    }

    if (conversionErrorDetails.length > 0) {
      const errorMessagesSummary = conversionErrorDetails.map(e => `"${e.name}" (Ruta: ${e.path})`).join(', ');
      setTimeout(() => toast({
        title: "Problemas en Procesamiento de Imágenes",
        description: (
          <div className="text-xs max-h-32 overflow-y-auto">
            {conversionErrorDetails.length} imagen(es) tuvieron problemas (ej. TIFF/BMP no convertidos): {errorMessagesSummary}.
            Detalles en consola. Haga clic en una imagen con error para ver su ruta y convertir manually si es necesario.
          </div>
        ),
        variant: "destructive",
        duration: 20000
      }),0);
      conversionErrorDetails.forEach(e => console.error(`Error procesando ${e.name} (${e.path}): ${e.error}`));
    }
    
    try {
      let newImagesState: RankedImage[] = [];

      setImages(prevImages => {
        const existingImagesMap = new Map(prevImages.map(img => [img.id, img])); // img.id is canonical originalPath
        const finalImagesSet = new Set<string>(); // Tracks IDs (canonical originalPath) from the folder load
        const mergedImages: RankedImage[] = [];

        // Process images from the folder
        for (const folderImg of loadedImagesFromFolder) {
          if (existingImagesMap.has(folderImg.id)) { 
            // Image from folder already exists in state (matched by ID - canonical originalPath), update it
            const existingImg = existingImagesMap.get(folderImg.id)!;
            mergedImages.push({
              ...existingImg, // Keep existing scores and observations
              file: folderImg.file || existingImg.file, 
              pdfFile: folderImg.pdfFile || existingImg.pdfFile, 
              url: folderImg.url || ((existingImg.url && (existingImg.url.startsWith('data:') || existingImg.url.startsWith('http:'))) ? existingImg.url : ""), 
              name: folderImg.name, // folderImg.name is already normalized
              originalPath: folderImg.originalPath, // This should be same as id
              error: folderImg.error || existingImg.error, 
            });
          } else {
            // New image from folder, add it
            mergedImages.push(folderImg);
          }
          finalImagesSet.add(folderImg.id);
        }
        
        // Add back existing images that were not in the current folder load
        prevImages.forEach(prevImg => {
          if (!finalImagesSet.has(prevImg.id)) {
            mergedImages.push({
                ...prevImg,
                url: (prevImg.url && (prevImg.url.startsWith('data:') || prevImg.url.startsWith('http:'))) ? prevImg.url : "",
            });
          }
        });
        
        // Sort final list by id (canonical originalPath)
        mergedImages.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

        newImagesState = mergedImages;
        return mergedImages;
      });
      
      await new Promise(resolve => setTimeout(resolve, 0)); 

      for (const img of newImagesState) {
        try {
          await db.putImage(img);
        } catch (dbError) {
          console.error(`Error guardando/actualizando imagen en IndexedDB (folder select): ${img.name} (ID: ${img.id}):`, dbError);
          setTimeout(() => toast({
            title: `Error DB: ${img.name}`,
            description: "No se pudo guardar/actualizar en IndexedDB.",
            variant: "destructive",
            duration: 7000,
          }), 0);
        }
      }
      
      const numPdfsAssociated = newImagesState.filter(img => img.pdfFile).length;
      setTimeout(() => toast({
        title: "Imágenes Procesadas y Guardadas",
        description: `${loadedImagesFromFolder.length} imágenes de carpeta procesadas. ${numPdfsAssociated > 0 ? `${numPdfsAssociated} PDFs asociados.` : ''} Cambios guardados en IndexedDB.`,
      }),0);

    } catch (error) {
       console.error("Error al procesar imágenes de la carpeta:", error);
       setTimeout(() => toast({
        title: "Error General al Procesar Imágenes",
        description: "Algunas imágenes de la carpeta no pudieron ser procesadas o guardadas.",
        variant: "destructive",
      }),0);
    } finally {
      setIsLoadingFolder(false);
      if (event.target) event.target.value = '';
    }
  }, [toast]);


  const handleImportXlsx = useCallback(async (event: ChangeEvent<HTMLInputElement>, forSingleSession = true, judgeIndex?: number) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (forSingleSession) setIsImportingXlsx(true);
    else if (judgeIndex !== undefined) setImportingJudgeIndex(judgeIndex);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result;
        if (arrayBuffer instanceof ArrayBuffer) {
          const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

          type ExcelImportRow = {
            "ID (Clave de Ordenación)": string; // This is expected to be the canonical originalPath
            "Nombre de Imagen": string;
            "Calidad Artística (pts)": number;
            "Contextualización (pts)": number;
            "Originalidad (pts)": number;
            "Observaciones": string;
          };

          const importedRawData: Array<{
            idFromExcel: string; // This is the canonical originalPath from Excel
            name: string;
            scores: ImageScore;
            totalScore: number;
            observations: string;
          }> = jsonData.map((row: ExcelImportRow) => {
            const idFromExcelOriginal = String(row["ID (Clave de Ordenación)"] || "").trim();
            if (!idFromExcelOriginal) {
              console.warn("Skipping Excel row due to missing 'ID (Clave de Ordenación)':", row);
              return null;
            }
            // Ensure the ID from Excel is canonicalized (forward slashes, original casing preserved by Excel)
            const canonicalIdFromExcel = getCanonicalImagePath(idFromExcelOriginal);

            const artisticQuality = parseFloat(String(row["Calidad Artística (pts)"])) || 0;
            const contextualization = parseFloat(String(row["Contextualización (pts)"])) || 0;
            const originality = parseFloat(String(row["Originalidad (pts)"])) || 0;

            return {
              idFromExcel: canonicalIdFromExcel, 
              name: String(row["Nombre de Imagen"] || "Nombre Desconocido").trim().normalize('NFC'), // Normalize name
              scores: { artisticQuality, contextualization, originality },
              totalScore: artisticQuality + contextualization + originality,
              observations: String(row["Observaciones"] || '').trim().normalize('NFC'), // Normalize observations
            };
          }).filter(img => img !== null && img.name !== "Nombre Desconocido") as Array<{
            idFromExcel: string;
            name: string;
            scores: ImageScore;
            totalScore: number;
            observations: string;
          }>;


            if (importedRawData.length === 0 && jsonData.length > 0) {
                setTimeout(() => toast({
                    title: "Advertencia en Importación de Excel",
                    description: "No se encontraron datos válidos para importar. Verifique que la columna 'ID (Clave de Ordenación)' (debe ser la ruta del archivo) esté presente y poblada.",
                    variant: "destructive",
                    duration: 10000,
                }), 0);
                if (forSingleSession) setIsImportingXlsx(false);
                else if (judgeIndex !== undefined) setImportingJudgeIndex(null);
                if (event.target) event.target.value = '';
                return;
            }
            

          if (forSingleSession) {
            let finalImagesForStateUpdate: RankedImage[] = [];
            const unmatchedExcelEntries: typeof importedRawData = [];

            setImages(prevImages => {
                // Map keys are app's internal IDs (canonical originalPath)
                const existingImagesMap = new Map(prevImages.map(img => [img.id, img]));
                const mergedImages: RankedImage[] = [];
                const processedExistingImageIds = new Set<string>(); 
    
                for (const importedItem of importedRawData) { 
                    // importedItem.idFromExcel is already the canonical path from Excel
                    const idToMatchInApp = importedItem.idFromExcel;

                    if (existingImagesMap.has(idToMatchInApp)) {
                        const existingImg = existingImagesMap.get(idToMatchInApp)!;
                        mergedImages.push({
                            ...existingImg, 
                            scores: importedItem.scores,
                            totalScore: importedItem.totalScore,
                            name: importedItem.name, // Update name from Excel (already normalized)
                            observations: importedItem.observations || existingImg.observations || '', // Use normalized observations
                        });
                        processedExistingImageIds.add(existingImg.id);
                    } else {
                        unmatchedExcelEntries.push(importedItem);
                    }
                }
    
                prevImages.forEach(img => {
                    if (!processedExistingImageIds.has(img.id)) {
                        mergedImages.push(img);
                    }
                });
                
                mergedImages.sort((a,b) => (a.id || '').localeCompare(b.id || ''));
                finalImagesForStateUpdate = mergedImages;
                return mergedImages;
            });
   
            await new Promise(resolve => setTimeout(resolve, 0)); 
  
            for (const img of finalImagesForStateUpdate) {
              try {
                await db.putImage(img);
              } catch (dbError) {
                console.error(`Error guardando/actualizando imagen en IndexedDB (Excel import): ${img.name} (ID: ${img.id}):`, dbError);
                setTimeout(() => toast({
                  title: `Error DB (Excel): ${img.name}`,
                  description: "No se pudo guardar/actualizar en IndexedDB.",
                  variant: "destructive",
                }), 0);
              }
            }
            
            const numImportedSuccessfully = importedRawData.length - unmatchedExcelEntries.length;

            if (unmatchedExcelEntries.length > 0) {
                const exampleUnmatched = unmatchedExcelEntries[0];
                const exampleAppImage = images.length > 0 ? images[0] : null;
                
                const detailMessage = (
                    <div className="text-xs max-h-60 overflow-y-auto">
                        <p>No se encontraron imágenes coincidentes en la aplicación para {unmatchedExcelEntries.length} entrada(s) del Excel.</p>
                        <p className="mt-1"><strong>Lógica de Coincidencia:</strong> El "ID (Clave de Ordenación)" del Excel debe ser exactamente igual al "ID de la Imagen Cargada en App" (que es la ruta relativa canónica, ej: <code>subcarpeta/imagen.jpg</code>). La comparación es sensible a mayúsculas y minúsculas y a caracteres especiales (acentos, ñ, etc.).</p>
                        
                        <p className="mt-2"><strong>Ejemplo de Entrada Excel NO Coincidente:</strong></p>
                        <ul className="list-disc pl-5">
                            <li>Nombre Excel: '{exampleUnmatched.name}'</li>
                            <li>ID Excel (Original): '{jsonData.find(row => getCanonicalImagePath(String(row["ID (Clave de Ordenación)"] || "")) === exampleUnmatched.idFromExcel)?.["ID (Clave de Ordenación)"] || "N/A"}'</li>
                            <li>ID Excel (Canónico para búsqueda): <code>{exampleUnmatched.idFromExcel}</code> (Longitud: {exampleUnmatched.idFromExcel.length})</li>
                        </ul>

                        {exampleAppImage && (
                            <>
                                <p className="mt-2"><strong>Ejemplo de Imagen Cargada en App (para comparación):</strong></p>
                                <ul className="list-disc pl-5">
                                    <li>Nombre App: '{exampleAppImage.name}'</li>
                                    <li>ID App (Ruta Canónica): <code>{exampleAppImage.id}</code> (Longitud: {exampleAppImage.id.length})</li>
                                </ul>
                            </>
                        )}
                        <p className="mt-2"><strong>Posibles Razones:</strong></p>
                        <ul className="list-disc pl-5">
                            <li>La imagen no fue cargada en la app desde la carpeta.</li>
                            <li>Diferencias sutiles en la ruta (mayúsculas/minúsculas, espacios extra, caracteres especiales, forma de normalización de acentos/ñ).</li>
                            <li>La columna "ID (Clave de Ordenación)" en Excel no representa la ruta relativa correcta tal como la app la genera.</li>
                        </ul>
                        <p className="mt-2"><strong>Entradas no coincidentes (primeras 5):</strong></p>
                        <ul className="list-disc pl-5">
                            {unmatchedExcelEntries.slice(0,5).map(item => (
                                <li key={item.idFromExcel}>'{item.name}' (ID Excel Canónico: <code>{item.idFromExcel}</code>)</li>
                            ))}
                             {unmatchedExcelEntries.length > 5 && <li>... y {unmatchedExcelEntries.length - 5} más.</li>}
                        </ul>
                         <Button variant="link" size="sm" asChild className="mt-2 text-xs p-0 h-auto">
                           <a href="/debug-excel-import" target="_blank" rel="noopener noreferrer">Abrir página de debug de Excel</a>
                         </Button>
                    </div>
                );

                setTimeout(() => toast({
                    title: `${unmatchedExcelEntries.length} Valoraciones de Excel no Aplicadas`,
                    description: detailMessage,
                    variant: "warning",
                    duration: 30000, 
                }), 0);
            }


            if (numImportedSuccessfully > 0) {
                setTimeout(() => toast({
                  title: "Excel Importado y Datos Guardados",
                  description: `${numImportedSuccessfully} valoraciones aplicadas. ${unmatchedExcelEntries.length > 0 ? `${unmatchedExcelEntries.length} no aplicadas (ver detalles).` : ''}`,
                  duration: 12000,
                }),0);
            } else if (importedRawData.length > 0 && unmatchedExcelEntries.length === importedRawData.length) {
                 setTimeout(() => toast({
                    title: "Importación de Excel Sin Coincidencias",
                    description: `Ninguna de las ${importedRawData.length} valoraciones del Excel pudo ser aplicada. Verifique los IDs (rutas de archivo) en el Excel.`,
                    variant: "warning",
                    duration: 15000,
                 }),0);
            }


          } else if (judgeIndex !== undefined) { 
            // Logic for multi-judge import
            const judgeParsedImages: RankedImage[] = importedRawData.map(item => {
               // item.idFromExcel is already the canonical path from Excel
               const canonicalPathId = item.idFromExcel; 

              return {
                id: canonicalPathId, 
                name: item.name, // Already normalized
                scores: item.scores,
                totalScore: item.totalScore,
                observations: item.observations, // Already normalized
                originalPath: canonicalPathId, // Store the canonical path also as originalPath for consistency
                url: "", 
                file: undefined,
                pdfFile: undefined,
                error: undefined,
              };
            });

            setJudgeFilesData(prevData => {
              const newData = [...prevData];
              newData[judgeIndex] = judgeParsedImages;
              return newData;
            });
            setTimeout(() => toast({
              title: `Excel del Juez ${judgeIndex + 1} Importado`,
              description: `${judgeParsedImages.length} valoraciones importadas.`,
            }),0);
          }

        } else {
          throw new Error("Error al leer el archivo Excel.");
        }
      };
      reader.onerror = () => {
        throw new Error("No se pudo leer el archivo Excel.");
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("Error al importar XLSX:", error);
      setTimeout(() => toast({
        title: "Error al Importar Excel",
        description: (error instanceof Error ? error.message : "Hubo un problema al procesar el archivo."),
        variant: "destructive",
      }),0);
    } finally {
      if (forSingleSession) setIsImportingXlsx(false);
      else if (judgeIndex !== undefined) setImportingJudgeIndex(null);
      if (event.target) event.target.value = '';
    }
  }, [toast, images]);

  const calculateAverageScores = useCallback((allJudgeScores: Array<RankedImage[] | null>): RankedImage[] => {
    if (allJudgeScores.some(data => data === null) || allJudgeScores.filter(Boolean).length < 3) {
      setTimeout(() => toast({ title: "Error", description: "Se necesitan los archivos Excel de los 3 jueces.", variant: "destructive" }), 0);
      return [];
    }
  
    const validJudgeScores = allJudgeScores.filter(Boolean) as RankedImage[][];
    if (validJudgeScores.length === 0) return [];
  
    // Use a map where keys are canonical originalPaths (which is the ID)
    const imageMap = new Map<string, { scores: ImageScore[], names: string[], originalPaths: string[], observationsArr: string[][] }>();
  
    validJudgeScores.forEach((judgeData, judgeIdx) => {
      judgeData.forEach(img => {
        // img.id for judge data is already canonical originalPath from Excel import
        const idKey = img.id; 
        if (!imageMap.has(idKey)) {
          imageMap.set(idKey, { scores: [], names: [], originalPaths: [], observationsArr: [[], [], []] });
        }
        const entry = imageMap.get(idKey)!;
        entry.scores.push(img.scores);
        if (!entry.names.includes(img.name)) entry.names.push(img.name); 
        // img.originalPath from judge's import is the canonical originalPath
        if (img.originalPath && !entry.originalPaths.includes(img.originalPath)) {
            entry.originalPaths.push(img.originalPath);
        }
        if (img.observations) { // observations are already normalized from import
            entry.observationsArr[judgeIdx].push(img.observations);
        }
      });
    });
  
    const averagedImages: RankedImage[] = [];
    imageMap.forEach((data, idKey) => { 
      if (data.scores.length > 0) {
        const numJudgesWhoScored = data.scores.length;
  
        const avgArtisticQuality = data.scores.reduce((sum, s) => sum + (s.artisticQuality || 0), 0) / numJudgesWhoScored;
        const avgContextualization = data.scores.reduce((sum, s) => sum + (s.contextualization || 0), 0) / numJudgesWhoScored;
        const avgOriginality = data.scores.reduce((sum, s) => sum + (s.originality || 0), 0) / numJudgesWhoScored;
        
        let combinedObservations = "";
        // Observations are not included in the average PDF
        // if (!true) { 
        //      data.observationsArr.forEach((obsArray, judgeIdx) => {
        //         if (obsArray.length > 0) {
        //             combinedObservations += `Juez ${judgeIdx + 1}:\n${obsArray.join('\n')}\n\n`;
        //         }
        //     });
        // }
        
        const pathParts = idKey.split('/');
        let contestantName = "Concursante Desconocido"; 
        if (pathParts.length > 2 && pathParts[0].toUpperCase() === 'CONCURSANTES') {
          contestantName = pathParts[1];
        } else {
          // Fallback if structure is not as expected, use the name from the first judge's data
          // or the first part of the ID if it looks like a name
          contestantName = data.names[0] || (pathParts.length > 0 ? pathParts[0] : "Concursante Desconocido");
          console.warn(`Contestant name extraction for average PDF: Path "${idKey}" did not strictly match 'CONCURSANTES/Name/Image.ext'. Used fallback: "${contestantName}"`);
        }
        
        const representativeOriginalPath = data.originalPaths[0] || idKey;
        
        averagedImages.push({
          id: idKey, 
          name: contestantName.toUpperCase().normalize('NFC'), // Use extracted contestant name, ensure normalized and UPPPERCASE
          originalPath: representativeOriginalPath, 
          url: "",
          scores: {
            artisticQuality: avgArtisticQuality,
            contextualization: avgContextualization,
            originality: avgOriginality,
          },
          totalScore: avgArtisticQuality + avgContextualization + avgOriginality,
          observations: combinedObservations.trim(), 
        });
      }
    });
    
    averagedImages.sort((a, b) => {
        if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
        }
        // Ensure consistent secondary sort using the ID (originalPath)
        return (a.id || '').localeCompare(b.id || '');
    });
    return averagedImages;
  }, [toast]);

  const handleGenerateAverageRankingPdf = async () => {
    if (judgeFilesData.some(data => data === null)) {
      setTimeout(() => toast({
        title: "Faltan Datos",
        description: "Por favor, importa los archivos Excel de los 3 jueces.",
        variant: "destructive",
      }), 0);
      return;
    }
    setIsGeneratingAveragePdf(true);
    try {
      const averagedRankedImages = calculateAverageScores(judgeFilesData);
      if (averagedRankedImages.length === 0 && judgeFilesData.filter(Boolean).length > 0) {
        setTimeout(() => toast({ title: "No hay datos para promediar", description: "Asegúrate de que los Excel importados contengan datos válidos o que se hayan cargado los 3 archivos."}), 0);
        setIsGeneratingAveragePdf(false);
        return;
      }

      const serializableAvgImages = averagedRankedImages.map(toActionSerializable);
      const averagePdfFullTitle = "IV Premio Bienal Nacional de Fotografía Científica del IQUEMA - Ranking Final Promedio de Clasificación";
      // Pass "Nombre del Concursante" for mainNameColumnTitle and "Nombre Imagen" for imageNameColumnTitle
      const pdfBase64 = await generateRankingPdf(serializableAvgImages, averagePdfFullTitle, true, "Nombre del Concursante", "Nombre Imagen"); 
      
      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'ranking_promedio_jueces.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setTimeout(() => toast({ title: 'PDF Promedio Descargado', description: 'El ranking promedio de los jueces ha sido exportado a PDF.' }), 0);
    } catch (error) {
      console.error('Error al generar PDF promedio:', error);
      setTimeout(() => toast({ title: 'Error al generar PDF Promedio', description: (error instanceof Error && error.message) || 'No se pudo generar el PDF.', variant: 'destructive' }), 0);
    } finally {
      setIsGeneratingAveragePdf(false);
    }
  };

  const handleGenerateAverageRankingXlsx = async () => {
    if (judgeFilesData.some(data => data === null)) {
      setTimeout(() => toast({
        title: "Faltan Datos",
        description: "Por favor, importa los archivos Excel de los 3 jueces.",
        variant: "destructive",
      }), 0);
      return;
    }
    setIsGeneratingAverageXlsx(true);
    try {
      let averagedRankedImages = calculateAverageScores(judgeFilesData); 
      if (averagedRankedImages.length === 0 && judgeFilesData.filter(Boolean).length > 0) {
        setTimeout(() => toast({ title: "No hay datos para promediar", description: "Asegúrate de que los Excel importados contengan datos válidos o que se hayan cargado los 3 archivos." }), 0);
        setIsGeneratingAverageXlsx(false);
        return;
      }

      // Sort by originalPath (which is the ID) for Excel export
      averagedRankedImages = averagedRankedImages.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

      const serializableAvgImages = averagedRankedImages.map(img => ({
        ...toActionSerializable(img),
      }));
      const xlsxBase64 = await generateRankingXlsx(serializableAvgImages); 

      const byteCharacters = atob(xlsxBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'ranking_promedio_jueces_orden_original.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setTimeout(() => toast({ title: 'Excel Promedio Descargado', description: 'El ranking promedio de los jueces (ordenado por ruta original) ha sido exportado a Excel.' }), 0);
    } catch (error) {
      console.error('Error al generar Excel promedio:', error);
      setTimeout(() => toast({ title: 'Error al generar Excel Promedio', description: (error instanceof Error && error.message) || 'No se pudo generar el Excel.', variant: 'destructive' }), 0);
    } finally {
      setIsGeneratingAverageXlsx(false);
    }
  };


  const handleImageClick = useCallback((image: RankedImage) => {
    const hasPreview = image.url && (image.url.startsWith('data:') || image.url.startsWith('http:'));
    const canDisplayOriginalFile = image.file && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(image.file.type.toLowerCase());

    if (image.error && !hasPreview && !canDisplayOriginalFile) {
      const openFileLocation = () => {
        if (image.originalPath) {
          navigator.clipboard.writeText(image.originalPath)
            .then(() => {
              toast({ title: "Ruta Copiada al Portapapeles", description: `La ruta del archivo "${image.name}" ha sido copiada: ${image.originalPath}`, duration: 7000 });
            })
            .catch(err => {
              toast({ title: "Ubicación del Archivo (copiar manualmente):", description: `${image.originalPath}`, duration: 10000 });
              console.warn('No se pudo copiar la ruta: ', err);
            });
        } else {
          toast({ title: "Ubicación no disponible", description: `No se encontró la ruta original para "${image.name}".`, variant: "destructive"});
        }
      };

      setTimeout(() => toast({
        title: "Previsualización no disponible",
        description: (
          <div className="flex flex-col gap-2 text-xs">
            <span>{`Imposible previsualizar "${image.name}". ${image.originalPath ? `Ruta: ${image.originalPath}. ` : ''}Error: ${image.error}. Convierta manualmente si es necesario.`}</span>
            {image.originalPath && (
              <Button variant="outline" size="sm" onClick={openFileLocation} className="mt-1 text-xs py-1 px-2 h-auto">
                Mostrar/Copiar Ruta del Archivo Original
              </Button>
            )}
          </div>
        ),
        variant: "destructive",
        duration: 20000, 
      }), 0);
      setSelectedImage(null); 
      setIsRatingModalOpen(false);
    } else {
      setSelectedImage(image);
      setIsRatingModalOpen(true);
    }
  }, [toast]);

  const handleCloseRatingModal = useCallback(() => {
    setIsRatingModalOpen(false);
    setSelectedImage(null);
  }, []);

  const handleScoreChange = useCallback(async (imageId: string, newScores: ImageScore, newObservations: string) => {
    let changedImageForDb: RankedImage | undefined;
    const normalizedObservations = newObservations.normalize('NFC'); // Normalize observations here

    setImages(prevImages => {
      const updatedImages = prevImages.map(img => {
        if (img.id === imageId) {
          changedImageForDb = {
            ...img,
            scores: newScores,
            totalScore: newScores.artisticQuality + newScores.contextualization + newScores.originality,
            observations: normalizedObservations, // Use normalized observations
          };
          return changedImageForDb;
        }
        return img;
      });
      return updatedImages;
    });

    if (changedImageForDb) {
      try {
        await db.putImage(changedImageForDb); // changedImageForDb now has normalized observations
      } catch (dbError) {
        console.error(`Error actualizando puntuación/observaciones en IndexedDB para ${changedImageForDb.name}:`, dbError);
        setTimeout(() => toast({
          title: `Error DB: ${changedImageForDb!.name}`,
          description: "No se pudo guardar la nueva puntuación/observación en IndexedDB.",
          variant: "destructive",
        }),0);
      }
    }
  }, [toast]);


  const galleryImages = useMemo(() => {
    // 'images' state is sorted by id (canonical originalPath)
    return images;
  }, [images]);

  const rankedImagesByScore = useMemo(() => {
    return [...images].sort((a, b) => {
        if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
        }
        return (a.id || '').localeCompare(b.id || '');
    });
  }, [images]);

  const handleOpenPdfInNewTab = useCallback((imageWithPdf: RankedImage) => {
    if (imageWithPdf.pdfFile) {
      const url = URL.createObjectURL(imageWithPdf.pdfFile);
      window.open(url, '_blank');
      console.log(`Opening PDF in new tab for ${imageWithPdf.name}: ${imageWithPdf.pdfFile.name}`);
    } else {
      setTimeout(() => toast({
        title: "PDF no encontrado",
        description: `No hay un archivo PDF asociado con la imagen "${imageWithPdf.name}".`,
        variant: "destructive",
      }), 0);
       console.warn(`PDF Open: No PDF file found for image ${imageWithPdf.name} (ID: ${imageWithPdf.id})`);
    }
  }, [toast]);


  const handleClosePdfModal = useCallback(() => {
    if (selectedPdfUrl) {
      URL.revokeObjectURL(selectedPdfUrl);
    }
    setSelectedPdfUrl(null);
    setIsPdfModalOpen(false);
  }, [selectedPdfUrl]);


  useEffect(() => {
    if (isLoadedFromDb && images.length === 0 && !isLoadingFolder && !isImportingXlsx && !isLoadingFromDb) {
      const welcomeToastShown = sessionStorage.getItem('welcomeToastShown');
      if (!welcomeToastShown) {
        setTimeout(() => {
            toast({
            title: "¡Bienvenido a PhotoJudge!",
            description: "Selecciona una carpeta con imágenes o importa un archivo Excel (.xlsx) con valoraciones.",
            });
            sessionStorage.setItem('welcomeToastShown', 'true');
        }, 0); 
      }
    }
  }, [images.length, isLoadingFolder, isImportingXlsx, toast, isLoadedFromDb, isLoadingFromDb]);

  const handleDownloadPdf = async () => {
    if (rankedImagesByScore.length === 0) {
      setTimeout(() => toast({
        title: 'No hay datos para exportar',
        description: 'Por favor, valora algunas imágenes primero.',
        variant: 'destructive',
      }),0);
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const serializableRankedImages: ActionSerializableRankedImage[] = rankedImagesByScore.map(toActionSerializable);
      
      const finalReportTitleForSingleSession = "IV Premio Bienal Nacional de Fotografía Científica del IQUEMA - Ranking de Clasificación";
      // For single session PDF, observations are shown, and the name column is 'Nombre de Imagen'
      const pdfBase64 = await generateRankingPdf(serializableRankedImages, finalReportTitleForSingleSession, false, "Nombre de Imagen"); 
      
      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'ranking_fotografias.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); 
      setTimeout(() => toast({ title: 'PDF Descargado', description: 'El ranking ha sido exportado a PDF.' }),0);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      setTimeout(() => toast({ title: 'Error al generar PDF', description: (error instanceof Error && error.message) || 'No se pudo generar el PDF.', variant: 'destructive' }),0);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadXlsx = async () => {
    if (images.length === 0) { 
      setTimeout(() => toast({ title: 'No hay datos para exportar', description: 'Por favor, valora algunas imágenes.', variant: 'destructive' }),0);
      return;
    }
    setIsDownloadingXlsx(true);
    try {
      // XLSX uses images sorted by id (canonical originalPath)
      const sortedImagesForXlsx = [...images].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      const serializableImagesForXlsx: ActionSerializableRankedImage[] = sortedImagesForXlsx.map(toActionSerializable);
      const xlsxBase64 = await generateRankingXlsx(serializableImagesForXlsx);
      
      const byteCharacters = atob(xlsxBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'ranking_fotografias_orden_original.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); 
      setTimeout(() => toast({ title: 'Excel (.xlsx) Descargado', description: 'El ranking ha sido exportado a Excel, ordenado por ruta de archivo original.' }),0);
    } catch (error) {
      console.error('Error al generar XLSX:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTimeout(() => toast({ title: 'Error al generar Excel', description: `Error: ${errorMessage}. Consulte la consola para más detalles.`, variant: 'destructive' }),0);
    } finally {
      setIsDownloadingXlsx(false);
    }
  };

  const handleOpenResetConfirm = () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = async () => {
    try {
      await db.clearStore(); 
      setImages([]); 
      setSelectedImage(null);
      setJudgeFilesData([null, null, null]); 
      setIsRatingModalOpen(false);
      sessionStorage.removeItem('welcomeToastShown'); 
      setIsResetConfirmOpen(false);
      setTimeout(() => toast({
        title: "Aplicación Reseteada",
        description: "Todas las imágenes cargadas y sus valoraciones han sido eliminadas de la sesión actual y de IndexedDB. Los datos de Excel de jueces también se eliminarán.",
      }), 0);
    } catch (error) {
      console.error("Error al resetear IndexedDB:", error);
      setTimeout(() => toast({
        title: "Error al Resetear",
        description: "No se pudo limpiar la base de datos local. Intenta refrescar la página.",
        variant: "destructive",
      }), 0);
      setIsResetConfirmOpen(false); 
    }
  };

  const isLoading = isLoadingFolder || isImportingXlsx || isLoadingFromDb || importingJudgeIndex !== null;

  const handleFilePathClick = (filePath?: string) => {
    if (filePath) {
      navigator.clipboard.writeText(filePath)
        .then(() => {
          toast({ title: "Ruta Copiada", description: `La ruta '${filePath}' ha sido copiada al portapapeles.` });
        })
        .catch(err => {
          console.warn('No se pudo copiar la ruta: ', err);
          toast({ title: "Ruta del Archivo", description: filePath, duration: 10000 });
        });
    } else {
      toast({ title: "Ruta no disponible", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8">
      <header className="mb-8 flex flex-col items-center">
        <div className="mb-4">
          <Image
            src="/logo-iquema-uco.png" 
            alt="IQUEMA UCO Logo"
            width={543} 
            height={105} 
            className="h-auto rounded-md shadow-md" 
            priority 
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://picsum.photos/seed/iquema-logo-fallback/200/50";
              (e.target as HTMLImageElement).alt = "IQUEMA Logo Placeholder";
            }}
            data-ai-hint="university research institute logo"
          />
        </div>
        
        <h1 className="text-2xl md:text-3xl font-bold text-primary text-center">
          IV Premio Bienal Nacional de Fotografía Científica del IQUEMA
        </h1>
        <p className="text-xl md:text-2xl text-center text-muted-foreground mt-1">
          PhotoJudge
        </p>
        <p className="text-center text-muted-foreground mt-2">
          Valora las imágenes para el concurso de fotografía.
        </p>
      </header>

      <div className="mb-8 text-center space-y-4 sm:space-y-0 sm:flex sm:flex-wrap sm:justify-center sm:items-center sm:gap-4">
        <Label
          htmlFor="folder-upload"
          className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 cursor-pointer"
        >
          {isLoadingFolder ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <FolderOpen className="mr-2 h-5 w-5" />
          )}
          {isLoadingFolder ? 'Cargando Imágenes...' : 'Seleccionar Carpeta'}
        </Label>
        <Input
          id="folder-upload"
          type="file"
          // @ts-ignore 
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderSelect}
          className="hidden" 
          aria-label="Seleccionar carpeta de imágenes"
          disabled={isLoading} 
          accept="image/jpeg,image/png,image/webp,image/gif,image/tiff,image/bmp,application/pdf" 
        />

        <Label
          htmlFor="xlsx-upload"
          className="inline-flex items-center justify-center px-6 py-3 border border-input text-base font-medium rounded-md shadow-sm text-primary bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
          {isImportingXlsx ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <FileUp className="mr-2 h-5 w-5" />
          )}
          {isImportingXlsx ? 'Importando...' : 'Importar Excel (Sesión Actual)'}
        </Label>
        <Input
          id="xlsx-upload"
          type="file"
          accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => handleImportXlsx(e, true)} 
          className="hidden"
          aria-label="Importar archivo Excel (.xlsx) para la sesión actual"
          disabled={isLoading}
        />

        <Button
            onClick={handleOpenResetConfirm}
            variant="outline"
            disabled={isLoading || (images.length === 0 && !isLoadedFromDb && judgeFilesData.every(f => f === null))}
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-md shadow-sm border-destructive text-destructive hover:bg-destructive/10"
            aria-label="Resetear aplicación"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Resetear Aplicación
        </Button>
        
         {images.length > 0 && !isLoading && (
          <p className="text-sm text-muted-foreground mt-2 block w-full">
            {images.length} imagen(es) en la sesión. Haz clic en una imagen para valorarla.
          </p>
        )}
      </div>
      
      <div className="mb-8 p-6 border rounded-lg shadow-md bg-card">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Users className="mr-2 h-6 w-6 text-primary" />
          Valoración por Múltiples Jueces
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Importa los archivos Excel (.xlsx) con las valoraciones de cada uno de los 3 jueces.
          Luego, genera un PDF o Excel con el ranking promedio.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {[0, 1, 2].map(index => (
            <div key={`judge-upload-${index}`}>
              <Label
                htmlFor={`judge-xlsx-upload-${index}`}
                className={`inline-flex w-full items-center justify-center px-4 py-2 border text-base font-medium rounded-md shadow-sm cursor-pointer ${
                  judgeFilesData[index] ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200' : 'border-input text-primary bg-background hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {importingJudgeIndex === index ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : judgeFilesData[index] ? (
                   <FileArchive className="mr-2 h-5 w-5 text-green-600" /> 
                ) : (
                  <FileUp className="mr-2 h-5 w-5" />
                )}
                {importingJudgeIndex === index ? 'Importando...' : judgeFilesData[index] ? `Excel Juez ${index + 1} Cargado` : `Importar Excel Juez ${index + 1}`}
              </Label>
              <Input
                id={`judge-xlsx-upload-${index}`}
                type="file"
                accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => handleImportXlsx(e, false, index)} 
                className="hidden"
                aria-label={`Importar archivo Excel del Juez ${index + 1}`}
                disabled={isLoading || (importingJudgeIndex !== null && importingJudgeIndex !== index)} 
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleGenerateAverageRankingPdf}
            disabled={isGeneratingAveragePdf || judgeFilesData.some(data => data === null)} 
            className="w-full sm:w-auto"
            aria-label="Generar PDF con ranking promedio de jueces"
          >
            {isGeneratingAveragePdf ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileDown className="mr-2 h-5 w-5" />}
            {isGeneratingAveragePdf ? 'Generando PDF Promedio...' : 'Generar PDF Ranking Promedio'}
          </Button>
          <Button
            onClick={handleGenerateAverageRankingXlsx}
            disabled={isGeneratingAverageXlsx || judgeFilesData.some(data => data === null)} 
            className="w-full sm:w-auto"
            variant="outline"
            aria-label="Generar Excel con ranking promedio de jueces"
          >
            {isGeneratingAverageXlsx ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileSpreadsheet className="mr-2 h-5 w-5" />}
            {isGeneratingAverageXlsx ? 'Generando Excel Promedio...' : 'Generar Excel Ranking Promedio'}
          </Button>
        </div>
         {judgeFilesData.filter(Boolean).length > 0 && judgeFilesData.filter(Boolean).length < 3 && !isGeneratingAveragePdf && !isGeneratingAverageXlsx && (
            <p className="text-xs text-muted-foreground mt-2">
                Faltan {3 - judgeFilesData.filter(Boolean).length} archivo(s) de Excel de jueces por cargar.
            </p>
        )}
      </div>
      
      {isLoading && (
        <div className="flex flex-col items-center justify-center flex-grow">
          <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Procesando, por favor espera...</p>
        </div>
      )}

      {!isLoading && images.length === 0 && isLoadedFromDb && (
        <div className="flex flex-col items-center justify-center flex-grow text-center p-8 bg-card rounded-lg shadow">
          <ImageIcon className="h-24 w-24 text-muted-foreground mb-6" />
          <h2 className="text-2xl font-semibold mb-2">No hay imágenes para mostrar</h2>
          <p className="text-muted-foreground">
            Selecciona una carpeta o importa un archivo Excel (.xlsx) para comenzar.
          </p>
        </div>
      )}

      {!isLoading && images.length > 0 && (
        <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2">
            <h2 className="text-2xl font-semibold mb-4 flex items-center">
              <ImageIcon className="mr-2 h-6 w-6 text-primary" />
              Galería de Imágenes
            </h2>
            <ScrollArea className="h-[calc(100vh-400px)] pr-4 -mr-4"> 
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {galleryImages.map(image => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    onImageClick={handleImageClick}
                    onPdfClick={handleOpenPdfInNewTab} 
                    onFilePathClick={handleFilePathClick}
                  />
                ))}
              </div>
            </ScrollArea>
          </section>

          <aside className="lg:col-span-1">
            <div>
              <h2 className="text-2xl font-semibold flex items-center mb-2">
                <ListOrdered className="mr-2 h-6 w-6 text-primary" />
                Ranking
              </h2>
              <div className="flex gap-2 mb-4">
                <Button
                  onClick={handleDownloadPdf}
                  variant="outline"
                  size="sm"
                  disabled={isDownloadingPdf || rankedImagesByScore.length === 0}
                  aria-label="Descargar ranking en PDF"
                >
                  {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  {isDownloadingPdf ? 'Generando...' : 'PDF (Sesión Actual)'}
                </Button>
                <Button
                  onClick={handleDownloadXlsx}
                  variant="outline"
                  size="sm"
                  disabled={isDownloadingXlsx || images.length === 0}
                  aria-label="Descargar ranking en Excel (.xlsx)"
                >
                  {isDownloadingXlsx ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                  {isDownloadingXlsx ? 'Generando...' : 'Excel (Sesión Actual)'}
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[calc(100vh-440px)] pr-4 -mr-4"> 
              {rankedImagesByScore.length > 0 ? (
                rankedImagesByScore.map((image, index) => (
                  <RankingListItem
                    key={image.id}
                    image={image}
                    rank={index + 1}
                    onImageClick={handleImageClick} 
                    onFilePathClick={handleFilePathClick}
                  />
                ))
              ) : (
                <p className="text-muted-foreground">Aún no hay imágenes valoradas en la sesión actual.</p>
              )}
            </ScrollArea>
          </aside>
        </main>
      )}

      {selectedImage && (
        <ImageRatingModal
          isOpen={isRatingModalOpen}
          onClose={handleCloseRatingModal}
          image={selectedImage}
          onScoreChange={handleScoreChange}
          onPdfClick={handleOpenPdfInNewTab} 
        />
      )}
      
      {selectedPdfUrl && isPdfModalOpen && ( 
        <PdfViewerModal
          isOpen={isPdfModalOpen}
          onClose={handleClosePdfModal}
          pdfUrl={selectedPdfUrl}
        />
      )}
      
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará todas las imágenes cargadas y sus valoraciones de la sesión actual y de la base de datos local (IndexedDB). Los datos de Excel de jueces también se eliminarán. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsResetConfirmOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar Reseteo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <footer className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
        <div className="flex flex-col items-center justify-center">
            <Image
                src="/favicon_logo_scai.png" 
                alt="SCAI UCO Logo"
                width={50} 
                height={50} 
                className="h-auto rounded-md mb-2"
                data-ai-hint="university service logo"
                onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://picsum.photos/seed/scai-logo-fallback/50/50";
                    (e.target as HTMLImageElement).alt = "SCAI Logo Placeholder";
                }}
            />
            <p>&copy; {new Date().getFullYear()} PhotoJudge. Creado por MMP. Unidad de Fotografía Científica del SCAI. Universidad de Córdoba.</p>
            <p className="text-xs mt-1">
            Las valoraciones e imágenes se guardan en IndexedDB. Use la opción de exportar/importar Excel para persistencia robusta de valoraciones o para transferir entre dispositivos/navegadores.
            Las imágenes TIFF y BMP pueden requerir conversión a PNG para previsualización; el original se usa como respaldo.
            </p>
        </div>
      </footer>
    </div>
  );
}
