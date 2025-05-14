// src/lib/image-converter.ts

export interface ConvertedImageInfo {
  originalName: string;
  originalPath: string;
  originalLastModified: number;
  originalSize: number;
  file: File;
  dataUrl?: string;
  error?: string;
}

const getCanonicalImagePath = (path: string): string => {
  return path.replace(/\\/g, '/'); 
}

export async function convertTiffToPng(originalFile: File): Promise<ConvertedImageInfo> {
  const originalName = originalFile.name;
  const canonicalOriginalPath = getCanonicalImagePath(originalFile.webkitRelativePath || originalName);
  const originalLastModified = originalFile.lastModified;
  const originalSize = originalFile.size;

  const loadTiffJs = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
          if (window.Tiff) {
              resolve(window.Tiff);
              return;
          }

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
              
              const script = document.createElement('script');
              script.src = cdnUrls[urlIndex];
              script.crossOrigin = 'anonymous';
              
              script.onload = () => {
                  if (window.Tiff) {
                      resolve(window.Tiff);
                  } else {
                      tryLoadScript(urlIndex + 1);
                  }
              };
              
              script.onerror = () => {
                  loadAttempts++;
                  script.remove();
                  tryLoadScript(urlIndex + 1);
              };
              
              document.head.appendChild(script);
          };
          
          tryLoadScript(0);
      });
  };

  return new Promise(async (resolve) => {
      try {
          const isTiffFile = originalFile.type.toLowerCase() === 'image/tiff' || 
                           originalName.toLowerCase().endsWith('.tif') || 
                           originalName.toLowerCase().endsWith('.tiff');

          if (isTiffFile && !window.Tiff) { 
              try {
                  await loadTiffJs();
              } catch (e) {
                  console.warn(`Could not load TIFF processing library: ${(e as Error).message}. Will try fallback canvas method.`);
              }
          }

          const reader = new FileReader();
          
          reader.onload = async (event) => {
              if (!event.target?.result) {
                  resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: `FileReader did not return a result for ${originalName}` });
                  return;
              }
              
              if (isTiffFile && window.Tiff) {
                  try { 
                      let buffer: ArrayBuffer;
                      const result = event.target.result;
                      
                      if (typeof result === 'string') {
                          const base64Marker = ';base64,';
                          const base64Index = result.indexOf(base64Marker);
                          if (base64Index === -1) throw new Error('Invalid Data URL');
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
                      const canvas = tiff.toCanvas();
                      
                      if (!canvas) {
                          tiff.close();
                          throw new Error('Failed to render TIFF to canvas');
                      }

                      const pngDataUrl = canvas.toDataURL('image/png');
                      const byteString = atob(pngDataUrl.split(',')[1]);
                      const ab_png = new ArrayBuffer(byteString.length);
                      const ia_png = new Uint8Array(ab_png);
                      for (let i = 0; i < byteString.length; i++) {
                          ia_png[i] = byteString.charCodeAt(i);
                      }
                      const pngBlob = new Blob([ab_png], { type: 'image/png' });
                      const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
                      const pngFileName = `${baseName}.png`;
                      const pngFile = new File([pngBlob], pngFileName, { type: 'image/png', lastModified: originalLastModified });
                      
                      tiff.close();
                      resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: pngFile, dataUrl: pngDataUrl });
                      return; 
                  } catch (tiffError: any) {
                      console.warn(`Tiff.js processing failed: ${tiffError.message}. Will attempt fallback method.`);
                  }
              }

              const img = new window.Image();
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.width;
                  canvas.height = img.height;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) {
                      resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: `Could not get canvas context for ${originalName}` });
                      return;
                  }
                  ctx.drawImage(img, 0, 0);
                  try {
                      const pngDataUrl = canvas.toDataURL('image/png');
                      const byteString = atob(pngDataUrl.split(',')[1]);
                      const ab_fb = new ArrayBuffer(byteString.length);
                      const ia_fb = new Uint8Array(ab_fb);
                      for (let i = 0; i < byteString.length; i++) {
                          ia_fb[i] = byteString.charCodeAt(i);
                      }
                      const pngBlob = new Blob([ab_fb], { type: 'image/png' });
                      const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
                      const pngFileName = `${baseName}.png`;
                      const pngFile = new File([pngBlob], pngFileName, { type: 'image/png', lastModified: originalLastModified });
                      resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: pngFile, dataUrl: pngDataUrl });
                  } catch (e) {
                      const errorMsg = `Conversion to PNG failed: ${(e as Error).message}`;
                      resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: errorMsg });
                  }
              };
              img.onerror = () => {
                  const errorMsg = `Could not load image ${originalName} into an <img> tag`;
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
                      resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: 'Error creating blob/objectURL' });
                  }
              } else {
                  resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: 'Unexpected FileReader result type' });
              }
          }; 
          
          reader.onerror = () => {
              resolve({ originalName, originalPath: canonicalOriginalPath, originalLastModified, originalSize, file: originalFile, error: 'FileReader error' });
          };
          
          if (isTiffFile && window.Tiff) {
              reader.readAsArrayBuffer(originalFile);
          } else { 
              reader.readAsDataURL(originalFile);
          }

      } catch (error: any) { 
          resolve({ 
              originalName, 
              originalPath: canonicalOriginalPath, 
              originalLastModified, 
              originalSize, 
              file: originalFile, 
              error: error?.message || 'Unknown error during conversion' 
          });
      }
  }); 
}

export async function convertTiffAndBmpToPngIfNecessary(files: File[]): Promise<ConvertedImageInfo[]> {
  const results: ConvertedImageInfo[] = [];

  for (const file of files) {
      const fileType = file.type.toLowerCase();
      const originalName = file.name;
      const canonicalOriginalPath = getCanonicalImagePath(file.webkitRelativePath || originalName);
      const originalLastModified = file.lastModified;
      const originalSize = file.size;
  
      const isTiff = fileType === 'image/tiff' || originalName.toLowerCase().endsWith('.tif') || originalName.toLowerCase().endsWith('.tiff');
      const isBmp = fileType === 'image/bmp' || originalName.toLowerCase().endsWith('.bmp');
  
      if (isTiff || isBmp) {
          try {
              const conversionResult = await convertTiffToPng(file);
              results.push(conversionResult);
          } catch (error) { 
              const errorMsg = `Error during conversion: ${(error as Error).message}`;
              results.push({ 
                  originalName, 
                  originalPath: canonicalOriginalPath, 
                  originalLastModified, 
                  originalSize, 
                  file, 
                  error: errorMsg 
              });
          }
      } else if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(fileType)) {
          const reader = new FileReader();
          const result = await new Promise<ConvertedImageInfo>((resolve) => {
              reader.onload = (event) => {
                  if (event.target?.result) {
                      resolve({ 
                          originalName, 
                          originalPath: canonicalOriginalPath, 
                          originalLastModified, 
                          originalSize, 
                          file, 
                          dataUrl: event.target.result as string 
                      });
                  } else {
                      resolve({ 
                          originalName, 
                          originalPath: canonicalOriginalPath, 
                          originalLastModified, 
                          originalSize, 
                          file, 
                          error: 'FileReader did not return a result' 
                      });
                  }
              };
              reader.onerror = () => {
                  resolve({ 
                      originalName, 
                      originalPath: canonicalOriginalPath, 
                      originalLastModified, 
                      originalSize, 
                      file, 
                      error: 'FileReader error' 
                  });
              };
              reader.readAsDataURL(file);
          });
          results.push(result);
      } else {
          results.push({ 
              originalName, 
              originalPath: canonicalOriginalPath, 
              originalLastModified, 
              originalSize, 
              file, 
              error: 'Unsupported file type' 
          });
      }
  }
  return results;
}

// Exportamos todo lo necesario
export default {
  convertTiffAndBmpToPngIfNecessary,
  convertTiffToPng
};