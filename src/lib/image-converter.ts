// src/lib/image-converter.ts

export interface ConvertedImageInfo {
    originalName: string;
    originalPath: string; // Should store path with original casing and forward slashes
    originalLastModified: number;
    originalSize: number;
    file: File; // Este será el archivo original si no hay conversión/error, o el nuevo archivo PNG
    dataUrl?: string; // URL de datos del PNG convertido
    error?: string;
  }
  
  const getCanonicalImagePath = (path: string): string => {
    // Standardize slashes to forward slashes, preserve original casing from input.
    return path.replace(/\\/g, '/'); 
  }
  
  /**
   * Convierte archivos TIFF/BMP a PNG usando la biblioteca tiff.js (vía CDN)
   * Si la biblioteca no está disponible, intenta un método alternativo
   */
  export async function convertTiffToPng(originalFile: File): Promise<ConvertedImageInfo> {
    const originalName = originalFile.name;
    // Use original casing and forward slashes for originalPath
    const canonicalOriginalPath = getCanonicalImagePath(originalFile.webkitRelativePath || originalName);
    const originalLastModified = originalFile.lastModified;
    const originalSize = originalFile.size;
  
    // Función para cargar dinamicamente la biblioteca tiff.js desde múltiples fuentes
    const loadTiffJs = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        // Verificar si ya está cargado
        if (window.Tiff) {
          console.log("Tiff.js already loaded");
          resolve(window.Tiff);
          return;
        }
  
        // Lista de URLs para intentar
        const cdnUrls = [
          'https://cdn.jsdelivr.net/npm/tiff.js@1.0.0/tiff.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/tiff.js/1.0.0/tiff.min.js',
          'https://unpkg.com/tiff.js@1.0.0/tiff.min.js'
        ];
        
        let loadAttempts = 0;
        const maxAttempts = cdnUrls.length;
        
        const tryLoadScript = (urlIndex: number) => {
          if (urlIndex >= maxAttempts) {
            reject(new Error(`Failed to load Tiff.js script from all ${maxAttempts} CDNs`));
            return;
          }
          
          console.log(`Attempting to load Tiff.js from ${cdnUrls[urlIndex]}`);
          const script = document.createElement('script');
          script.src = cdnUrls[urlIndex];
          script.crossOrigin = 'anonymous'; 
          
          script.onload = () => {
            if (window.Tiff) {
              console.log(`Successfully loaded Tiff.js from ${cdnUrls[urlIndex]}`);
              resolve(window.Tiff);
            } else {
              console.warn(`Script loaded from ${cdnUrls[urlIndex]} but Tiff object not available`);
              tryLoadScript(urlIndex + 1);
            }
          };
          
          script.onerror = () => {
            console.warn(`Failed to load Tiff.js from ${cdnUrls[urlIndex]}, trying next source`);
            loadAttempts++;
            script.remove();
            tryLoadScript(urlIndex + 1);
          };
          
          document.head.appendChild(script);
        };
        
        tryLoadScript(0);
      });
    };
  
    declare global {
      interface Window {
        Tiff?: any;
      }
    }
  
    return new Promise(async (resolve) => {
      try {
        const isTiffFile = originalFile.type.toLowerCase() === 'image/tiff' || 
                           originalName.toLowerCase().endsWith('.tif') || 
                           originalName.toLowerCase().endsWith('.tiff');
  
        if (isTiffFile && !window.Tiff) { 
          try {
            await loadTiffJs();
            console.log("Tiff.js library loaded for", originalName);
          } catch (e) {
            console.warn(`Could not load TIFF processing library for ${originalName}: ${(e as Error).message}. Will try fallback canvas method.`);
          }
        }
  
        const reader = new FileReader();
        
        reader.onload = async (event) => {
          if (!event.target?.result) {
            resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: `FileReader did not return a result for ${originalName}` });
            return;
          }
          
          if (isTiffFile && window.Tiff) {
            console.log("Attempting to process TIFF with Tiff.js:", originalName);
            try { 
              let buffer: ArrayBuffer;
              const result = event.target.result;
              
              if (typeof result === 'string') {
                  const base64Marker = ';base64,';
                  const base64Index = result.indexOf(base64Marker);
                  if (base64Index === -1) throw new Error('TIFF file result from FileReader is not a valid Data URL for Tiff.js conversion to ArrayBuffer.');
                  const binaryString = result.substring(base64Index + base64Marker.length);
                  const binary = atob(binaryString);
                  buffer = new ArrayBuffer(binary.length);
                  const array = new Uint8Array(buffer);
                  for (let i = 0; i < binary.length; i++) {
                    array[i] = binary.charCodeAt(i);
                  }
              } else { 
                buffer = result as ArrayBuffer;
              }
              
              const tiff = new window.Tiff({ buffer });
              const width = tiff.width();
              const height = tiff.height();
              const canvas = tiff.toCanvas();
              
              if (!canvas) {
                tiff.close();
                throw new Error('Tiff.js: Failed to render TIFF to canvas.');
              }
  
              canvas.width = width;
              canvas.height = height;
              
              const pngDataUrl = canvas.toDataURL('image/png');
              const byteString = atob(pngDataUrl.split(',')[1]);
              const mimeString = pngDataUrl.split(',')[0].split(':')[1].split(';')[0];
              const ab_png = new ArrayBuffer(byteString.length);
              const ia_png = new Uint8Array(ab_png);
              for (let i = 0; i < byteString.length; i++) {
                ia_png[i] = byteString.charCodeAt(i);
              }
              const pngBlob = new Blob([ab_png], { type: mimeString });
              const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
              const pngFileName = `${baseName}.png`;
              const pngFile = new File([pngBlob], pngFileName, { type: 'image/png', lastModified: originalLastModified });
              
              tiff.close();
              console.log("Successfully converted TIFF to PNG using Tiff.js:", originalName);
              resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: pngFile, dataUrl: pngDataUrl });
              return; 
            } catch (tiffError: any) {
              let errMsg = 'Tiff.js processing failed with an unspecified error.';
              if (tiffError) {
                  if (typeof tiffError.message === 'string' && tiffError.message) {
                      errMsg = `Tiff.js: ${tiffError.message}`;
                  } else if (typeof tiffError === 'string') {
                      errMsg = `Tiff.js: ${tiffError}`;
                  } else if (typeof tiffError.toString === 'function') {
                      const errStr = tiffError.toString();
                      errMsg = errStr.includes("abort") ? `Tiff.js internal error: ${errStr}` : `Tiff.js: ${errStr}`;
                  }
              }
              console.warn(`Tiff.js processing failed for ${originalName}: ${errMsg}. Will attempt fallback canvas method.`, tiffError);
            }
          }
  
          console.log(`Using standard canvas method for ${originalName} (Not a TIFF, Tiff.js unavailable, or Tiff.js failed).`);
          const img = new window.Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                  resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: `Could not get canvas context for ${originalName} (fallback method).` });
                  return;
              }
              ctx.drawImage(img, 0, 0);
              try {
                  const pngDataUrl = canvas.toDataURL('image/png');
                  const byteString = atob(pngDataUrl.split(',')[1]);
                  const mimeString = pngDataUrl.split(',')[0].split(':')[1].split(';')[0];
                  const ab_fb = new ArrayBuffer(byteString.length);
                  const ia_fb = new Uint8Array(ab_fb);
                  for (let i = 0; i < byteString.length; i++) {
                    ia_fb[i] = byteString.charCodeAt(i);
                  }
                  const pngBlob = new Blob([ab_fb], { type: mimeString });
                  const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
                  const pngFileName = `${baseName}.png`;
                  const pngFile = new File([pngBlob], pngFileName, { type: 'image/png', lastModified: originalLastModified });
                  
                  console.log(`Successfully converted ${originalName} to PNG using standard canvas method (fallback).`);
                  resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: pngFile, dataUrl: pngDataUrl });
              } catch (e) {
                  const errorMsg = `Conversion to PNG failed for ${originalName} using standard canvas method (fallback): ${(e as Error).message}`;
                  console.error(errorMsg, e, "Original file:", originalFile);
                  resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: errorMsg });
              }
          };
          img.onerror = () => {
              const errorMsg = `Fallback Method: Could not load image ${originalName} into an <img> tag. Browser might not support displaying this format directly (e.g. some TIFFs), or Tiff.js failed prior. Cannot convert via standard canvas method. Original file kept.`;
              console.error(errorMsg, "Original File type:", originalFile.type, "Original File name:", originalFile.name);
              resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: errorMsg });
          };
  
          if (typeof event.target.result === 'string') {
              img.src = event.target.result;
          } else if (event.target.result instanceof ArrayBuffer) {
              try {
                  const blob = new Blob([event.target.result], { type: originalFile.type || 'image/tiff' }); 
                  const dataUrlForFallback = URL.createObjectURL(blob);
                  img.src = dataUrlForFallback;
              } catch (blobError) {
                  const errorMsg = `Fallback Method: Error creating blob/objectURL from ArrayBuffer for ${originalName}. Cannot attempt <img> load.`;
                  console.error(errorMsg, blobError, "Original File:", originalFile);
                  resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: errorMsg });
              }
          } else {
              const errorMsg = `Fallback Method: Unexpected FileReader result type for ${originalName}. Cannot set img.src.`;
              console.error(errorMsg, "Result type:", typeof event.target.result, "Original File:", originalFile);
              resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: errorMsg });
          }
        }; 
        
        reader.onerror = (e) => {
          const errorMsg = `FileReader error for ${originalName}`;
          console.error(errorMsg, e, "Original file:", originalFile);
          resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: errorMsg });
        };
        
        if (isTiffFile && window.Tiff) {
            console.log("Reading TIFF as ArrayBuffer (for Tiff.js attempt):", originalName);
            reader.readAsArrayBuffer(originalFile);
        } else { 
            console.log("Reading as DataURL (for BMP, or TIFF fallback):", originalName);
            reader.readAsDataURL(originalFile);
        }
  
      } catch (error: any) { 
        let errorMsg = 'Unknown error during conversion setup';
        if (error && typeof error.message === 'string' && error.message) {
          errorMsg = error.message;
        } else if (typeof error === 'string') {
          errorMsg = error;
        } else if (error && typeof error.toString === 'function') {
          errorMsg = error.toString();
        }
        console.error(`Outer conversion setup error for ${originalName}: ${errorMsg}`, error, "Original file:", originalFile);
        resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: errorMsg });
      }
    }); 
  }
  
  export async function convertTiffAndBmpToPngIfNecessary(files: File[]): Promise<ConvertedImageInfo[]> {
    const results: ConvertedImageInfo[] = [];
  
    for (const file of files) {
      const fileType = file.type.toLowerCase();
      const originalName = file.name;
      // Ensure originalPath is canonical (original casing, forward slashes)
      const canonicalOriginalPath = getCanonicalImagePath(file.webkitRelativePath || originalName);
      const originalLastModified = file.lastModified;
      const originalSize = file.size;
  
      const isTiff = fileType === 'image/tiff' || originalName.toLowerCase().endsWith('.tif') || originalName.toLowerCase().endsWith('.tiff');
      const isBmp = fileType === 'image/bmp' || originalName.toLowerCase().endsWith('.bmp');
  
      if (isTiff || isBmp) {
        console.log(`Attempting to convert ${originalName} (type: ${fileType}, path: ${canonicalOriginalPath}) to PNG.`);
        try {
          const conversionResult = await convertTiffToPng(file); 
          if(conversionResult.error) {
              console.error(`Conversion processing for ${originalName} (${canonicalOriginalPath}) resulted in error: ${conversionResult.error}`, "Full conversionResult object:", conversionResult);
          } else {
              console.log(`Successfully converted/processed ${originalName} (${canonicalOriginalPath}) to PNG or prepared data URL.`);
          }
          results.push(conversionResult);
        } catch (error) { 
          const errorMsg = `Unexpected error during convertTiffToPng call for ${originalName} (${canonicalOriginalPath}): ${(error as Error).message}. Original file kept.`;
          console.error(errorMsg, error, "Original file:", file);
          results.push({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file, error: errorMsg });
        }
      } else if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(fileType)){
        const reader = new FileReader();
        const promise = new Promise<ConvertedImageInfo>((resolve) => {
          reader.onload = (event) => {
            if (event.target?.result) {
              resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file, dataUrl: event.target.result as string });
            } else {
              const errorMsg = `FileReader did not return a result for directly displayable image ${originalName} (${canonicalOriginalPath}).`;
              console.error(errorMsg, "Original file:", file);
              resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file, error: errorMsg });
            }
          };
          reader.onerror = (e) => {
            const errorMsg = `FileReader error for directly displayable image ${originalName} (${canonicalOriginalPath}).`;
            console.error(errorMsg, e, "Original file:", file);
            resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file, error: errorMsg });
          };
          reader.readAsDataURL(file);
        });
        results.push(await promise);
  
      } else {
        const errorMsg = `Unsupported file type for direct display or conversion: ${originalName} (type: ${fileType}, path: ${canonicalOriginalPath}). Original file kept.`;
        console.warn(errorMsg, "File:", file); 
        results.push({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file, error: errorMsg });
      }
    }
    return results;
  }
  
  