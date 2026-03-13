import { useState, useCallback } from 'react';
import { toast } from 'sonner';

// Type definitions for File System Access API
interface FileSystemFileHandle {
    kind: 'file';
    name: string;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    close(): Promise<void>;
}

interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: {
        description: string;
        accept: Record<string, string[]>;
    }[];
}

declare global {
    interface Window {
        showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    }
}

export function useFileSystem() {
    const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
    const [isAutoSaving, setIsAutoSaving] = useState(false);

    const connectFile = useCallback(async () => {
        try {
            // Request a file handle from the user
            const handle = await window.showSaveFilePicker({
                suggestedName: 'financeiro-pessoal-db.json',
                types: [{
                    description: 'JSON Database',
                    accept: { 'application/json': ['.json'] },
                }],
            });
            setFileHandle(handle);
            toast.success("Arquivo conectado! O salvamento será automático.");
            return handle;
        } catch (err: unknown) {
            // Type guard for error
            if (err instanceof Error && err.name !== 'AbortError') {
                console.error('Error connecting file:', err);
                toast.error("Erro ao conectar arquivo.");
            }
            return null;
        }
    }, []);

    const saveToFile = useCallback(async (data: Record<string, unknown>) => {
        if (!fileHandle) return;

        try {
            setIsAutoSaving(true);
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();
        } catch (err) {
            console.error('Auto-save failed:', err);
            toast.error("Falha no salvamento automático.", { id: 'autosave-error' });
        } finally {
            setIsAutoSaving(false);
        }
    }, [fileHandle]);

    return {
        fileHandle,
        connectFile,
        saveToFile,
        isAutoSaving
    };
}

