import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface FileDropzoneProps {
    onFilesAccepted: (files: File[]) => Promise<void>;
    accept?: Record<string, string[]>;
    maxFiles?: number;
    disabled?: boolean;
}

interface FileStatus {
    file: File;
    status: 'pending' | 'processing' | 'success' | 'error';
    message?: string;
}

export function FileDropzone({
    onFilesAccepted,
    accept = { 'application/pdf': ['.pdf'] },
    maxFiles = 10,
    disabled = false,
}: FileDropzoneProps) {
    const [files, setFiles] = useState<FileStatus[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            if (acceptedFiles.length === 0) return;

            // Initialize file statuses
            const newFiles: FileStatus[] = acceptedFiles.map((file) => ({
                file,
                status: 'pending' as const,
            }));
            setFiles((prev) => [...prev, ...newFiles]);

            setIsProcessing(true);
            try {
                await onFilesAccepted(acceptedFiles);
                // Mark all as success
                setFiles((prev) =>
                    prev.map((f) =>
                        acceptedFiles.includes(f.file) ? { ...f, status: 'success' as const } : f
                    )
                );
            } catch (error) {
                // Mark all as error
                setFiles((prev) =>
                    prev.map((f) =>
                        acceptedFiles.includes(f.file)
                            ? { ...f, status: 'error' as const, message: String(error) }
                            : f
                    )
                );
            } finally {
                setIsProcessing(false);
            }
        },
        [onFilesAccepted]
    );

    const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
        onDrop,
        accept,
        maxFiles,
        disabled: disabled || isProcessing,
    });

    const clearFiles = () => setFiles([]);

    return (
        <div className="space-y-4">
            <div
                {...getRootProps()}
                className={cn(
                    'relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 cursor-pointer',
                    'flex flex-col items-center justify-center text-center',
                    isDragActive && !isDragReject
                        ? 'border-primary-500 bg-primary-500/10 scale-[1.02]'
                        : 'border-surface-600 hover:border-primary-500/50 hover:bg-surface-800/50',
                    isDragReject && 'border-danger bg-danger/10',
                    (disabled || isProcessing) && 'opacity-50 cursor-not-allowed'
                )}
            >
                <input {...getInputProps()} />

                <motion.div
                    animate={{ y: isDragActive ? -10 : 0 }}
                    className="mb-4"
                >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/20 flex items-center justify-center mb-4 mx-auto">
                        {isProcessing ? (
                            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
                        ) : (
                            <Upload className="w-8 h-8 text-primary-400" />
                        )}
                    </div>
                </motion.div>

                <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {isDragActive
                        ? 'Solte os arquivos aqui!'
                        : 'Arraste seus PDFs ou OFX aqui'}
                </h3>
                <p className="text-text-secondary text-sm max-w-md">
                    Faturas Nubank, XP Visa Infinite, ou Extratos Itaú (OFX).
                    <br />
                    Clique ou arraste até {maxFiles} arquivos de uma vez.
                </p>
            </div>

            {/* File List */}
            <AnimatePresence>
                {files.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2"
                    >
                        <div className="flex items-center justify-between text-sm text-text-secondary mb-2">
                            <span>Arquivos importados</span>
                            <button
                                onClick={clearFiles}
                                className="text-primary-400 hover:underline"
                            >
                                Limpar
                            </button>
                        </div>
                        {files.map((f, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={cn(
                                    'flex items-center gap-3 p-3 rounded-xl',
                                    f.status === 'success' && 'bg-success/10 border border-success/20',
                                    f.status === 'error' && 'bg-danger/10 border border-danger/20',
                                    f.status === 'pending' && 'bg-surface-700',
                                    f.status === 'processing' && 'bg-primary-500/10 border border-primary-500/20'
                                )}
                            >
                                <FileText className="w-5 h-5 text-text-secondary shrink-0" />
                                <span className="text-sm text-text-primary truncate flex-1">
                                    {f.file.name}
                                </span>
                                {f.status === 'processing' && (
                                    <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
                                )}
                                {f.status === 'success' && (
                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                )}
                                {f.status === 'error' && (
                                    <XCircle className="w-4 h-4 text-danger" />
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
