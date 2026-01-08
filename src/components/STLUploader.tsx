import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileUp, Loader2 } from 'lucide-react';
import { parseSTL, stlToOpenSCAD } from '@/lib/stl-parser';
import { STLMesh } from '@/types/openscad';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface STLUploaderProps {
  onCodeGenerated: (code: string) => void;
  onMeshLoaded: (mesh: STLMesh) => void;
}

export function STLUploader({ onCodeGenerated, onMeshLoaded }: STLUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.stl')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an STL file',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      const buffer = await file.arrayBuffer();
      const mesh = parseSTL(buffer);
      
      onMeshLoaded(mesh);
      
      const scadCode = stlToOpenSCAD(mesh);
      onCodeGenerated(scadCode);

      const triangleCount = mesh.vertices.length / 9;
      toast({
        title: 'STL imported successfully',
        description: `Converted ${triangleCount.toLocaleString()} triangles to OpenSCAD polyhedron`,
      });
    } catch (error) {
      toast({
        title: 'Failed to parse STL',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [onCodeGenerated, onMeshLoaded, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    // Reset input
    e.target.value = '';
  }, [processFile]);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isProcessing}
      className="gap-1"
      asChild
    >
      <label className="cursor-pointer">
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">
          {isProcessing ? 'Processing...' : 'Import STL'}
        </span>
        <input
          type="file"
          accept=".stl"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
        />
      </label>
    </Button>
  );
}
