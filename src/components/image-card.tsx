
import Image from "next/legacy/image";
import type { RankedImage } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, BadgeCheck, ImageIcon, AlertTriangle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface ImageCardProps {
  image: RankedImage;
  onImageClick: (image: RankedImage) => void;
  onPdfClick: (image: RankedImage) => void;
  onFilePathClick: (filePath?: string) => void;
}

export function ImageCard({ image, onImageClick, onPdfClick, onFilePathClick }: ImageCardProps) {
  const isRated = (image.totalScore ?? 0) > 0;
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const hasError = !!image.error;

  useEffect(() => {
    let objectUrlToRevoke: string | null = null;

    if (image) {
      if (image.url && (image.url.startsWith('data:') || image.url.startsWith('http'))) {
        setDisplayUrl(image.url);
      } 
      else if (image.file && !hasError) { 
        try {
          objectUrlToRevoke = URL.createObjectURL(image.file);
          setDisplayUrl(objectUrlToRevoke);
        } catch (error) {
          console.error(`Error creating Object URL for ${image.name} in ImageCard:`, error);
          setDisplayUrl(null);
        }
      } 
      else if (image.file && hasError) { // If there's an error but a file exists, try to create an object URL anyway
        try {
          objectUrlToRevoke = URL.createObjectURL(image.file);
          setDisplayUrl(objectUrlToRevoke);
        } catch (error) {
          console.error(`Error creating Object URL for errored image ${image.name} in ImageCard:`, error);
          setDisplayUrl(null);
        }
      }
      else {
        setDisplayUrl(null); 
      }
    } else {
      setDisplayUrl(null); 
    }

    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [image, hasError]);

  const isValidImageUrl = displayUrl !== null; 

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card's onClick from firing
    onFilePathClick(image.id); // Use image.id for consistency with displayed ID
  };


  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-lg transition-shadow duration-200 flex flex-col h-full",
        isRated && "border-primary border-2",
        hasError && "border-destructive border-2" 
      )}
      onClick={() => onImageClick(image)} 
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onImageClick(image);}}
      aria-label={`Rate image ${image.name}${isRated ? ' (Rated)' : ''}${hasError ? ' (Error loading)' : ''}`}
    >
      <CardHeader className="p-0 relative">
        <div className="aspect-square relative w-full">
          {isValidImageUrl ? (
            <Image
              src={displayUrl} 
              alt={image.name}
              layout="fill"
              objectFit="cover"
              className="rounded-t-lg"
              data-ai-hint="photography contest"
              onError={() => {
                if (displayUrl && displayUrl.startsWith('blob:')) { 
                    setDisplayUrl(null); 
                }
              }}
            />
          ) : (
            <div className="aspect-square w-full flex flex-col items-center justify-center bg-muted rounded-t-lg" aria-label="Image unavailable">
              <ImageIcon className="w-12 h-12 text-muted-foreground" />
              {hasError && <AlertTriangle className="w-6 h-6 text-destructive mt-1" />}
            </div>
          )}
        </div>
        {isRated && !hasError && ( 
          <BadgeCheck 
            className="absolute top-1.5 right-1.5 h-6 w-6 text-primary-foreground bg-primary rounded-full p-1" 
            aria-label="Rated" 
          />
        )}
         {hasError && ( 
          <AlertTriangle 
            className="absolute top-1.5 right-1.5 h-6 w-6 text-destructive-foreground bg-destructive rounded-full p-1" 
            aria-label="Error loading image"
          />
        )}
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <CardTitle 
          className="text-base font-medium truncate cursor-pointer hover:underline" 
          title={`Clic para copiar ruta: ${image.id}`} // Use image.id
          onClick={handleTitleClick} // Calls onFilePathClick(image.id)
        >
          {image.name}
        </CardTitle>
        <p 
          className="text-xs text-muted-foreground mt-1 truncate cursor-pointer hover:underline"
          title={`Clic para copiar ID: ${image.id}`}
          onClick={(e) => { e.stopPropagation(); onFilePathClick(image.id); }}
        >
          ID: <code className="bg-muted px-1 rounded">{image.id}</code>
        </p>
        {hasError && (
         <p className="text-xs text-destructive truncate" title={String(image.error)}>
         Error: {String(image.error).length > 50 ? String(image.error).substring(0, 50) + "..." : String(image.error)}
       </p>
       
        )}
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between items-center">
        <div className="flex items-center text-sm text-muted-foreground">
          <Star className="w-4 h-4 mr-1 text-amber-500 fill-amber-500" />
          <span>{(image.totalScore ?? 0).toFixed(0)} points</span>
        </div>
        {image.pdfFile && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation(); 
              onPdfClick(image);
            }}
            aria-label={`Ver PDF de ${image.name}`}
            title="Ver PDF asociado"
          >
            <FileText className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

