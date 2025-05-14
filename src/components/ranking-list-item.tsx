
import Image from "next/legacy/image";
import type { RankedImage } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Award, Star, ImageIcon, AlertTriangle } from 'lucide-react'; 
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface RankingListItemProps {
  image: RankedImage;
  rank: number;
  onImageClick: (image: RankedImage) => void;
  onFilePathClick: (filePath?: string) => void; 
}

export function RankingListItem({ image, rank, onImageClick, onFilePathClick }: RankingListItemProps) {
  const rankColors = [
    "text-amber-400", // 1st
    "text-slate-400", // 2nd
    "text-orange-600"  // 3rd
  ];

  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const hasError = !!image.error;

  useEffect(() => {
    let objectUrlToRevoke: string | null = null;
    
    if (image) {
      if (image.url && (image.url.startsWith('data:') || image.url.startsWith('http'))) {
        setDisplayUrl(image.url);
      } else if (image.file && !hasError) { 
        try {
          objectUrlToRevoke = URL.createObjectURL(image.file);
          setDisplayUrl(objectUrlToRevoke);
        } catch (error) {
          console.error(`Error creating Object URL for ${image.name} in RankingListItem:`, error);
          setDisplayUrl(null);
        }
      } else if (image.file && hasError) { // If there's an error but a file exists, try to create an object URL anyway
         try {
          objectUrlToRevoke = URL.createObjectURL(image.file);
          setDisplayUrl(objectUrlToRevoke);
        } catch (error) {
          console.error(`Error creating Object URL for errored image ${image.name} in RankingListItem:`, error);
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
    onFilePathClick(image.id); // Use image.id for consistency
  };

  return (
    <Card 
      className={cn(
        "mb-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow duration-200",
        hasError && "border-destructive"
      )}
      onClick={() => onImageClick(image)} 
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onImageClick(image);}}
      aria-label={`View image ${image.name}, currently ranked ${rank}${hasError ? ' (Error loading)' : ''}`}
    >
      <CardContent className="p-4 flex items-center space-x-4">
        <div className={`text-2xl font-bold w-10 text-center ${rank <= 3 ? rankColors[rank-1] : 'text-foreground'}`}>
          {rank}
        </div>
        <div className="relative w-16 h-16 rounded overflow-hidden shrink-0 bg-muted flex items-center justify-center">
          {isValidImageUrl ? (
            <Image
              src={displayUrl} 
              alt={image.name}
              layout="fill"
              objectFit="cover"
              data-ai-hint="photo thumbnail"
              onError={() => {
                if (displayUrl && displayUrl.startsWith('blob:')) { 
                    setDisplayUrl(null); 
                }
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground" aria-label="Image unavailable" />
              {hasError && <AlertTriangle className="w-4 h-4 text-destructive mt-1" />}
            </div>
          )}
        </div>
        <div className="flex-grow overflow-hidden">
          <h3 
            className="text-md font-semibold truncate cursor-pointer hover:underline" 
            title={`Clic para copiar ruta: ${image.id}`} // Use image.id
            onClick={handleTitleClick} // Calls onFilePathClick(image.id)
          >
            {image.name}
          </h3>
          <p className="text-sm text-muted-foreground flex items-center">
  <Star className="w-4 h-4 mr-1 text-amber-500 fill-amber-500" />
  Total: {(image.totalScore ?? 0).toFixed(0)} points
</p>
           <p 
            className="text-xs text-muted-foreground mt-0.5 truncate cursor-pointer hover:underline"
            title={`Clic para copiar ID: ${image.id}`}
            onClick={(e) => { e.stopPropagation(); onFilePathClick(image.id); }}
          >
            ID: <code className="bg-muted px-1 rounded">{image.id}</code>
          </p>
          {hasError && (
            <p className="text-xs text-destructive truncate" title={String(image.error)}>
              Error: {String(image.error).length > 30 ? String(image.error).substring(0, 30) + "..." : String(image.error)}
            </p>
          )}
        </div>
        {rank <= 3 && !hasError && <Award className={`w-6 h-6 shrink-0 ${rankColors[rank-1]}`} />}
      </CardContent>
    </Card>
  );
}

