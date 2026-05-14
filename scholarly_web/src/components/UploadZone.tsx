'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, CheckCircle, AlertCircle, Loader, FileText } from 'lucide-react';
import axios from 'axios';

interface UploadResponse {
  message?: string;
  error?: string;
  paper_id?: number;
}

interface UploadZoneProps {
  onUploadSuccess: (paperId: number, name: string) => void;
}

interface FileUploadStatus {
  name: string;
  state: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
}

const UploadZone = ({ onUploadSuccess }: UploadZoneProps) => {
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Bulk upload: process all files in parallel
    const statuses: FileUploadStatus[] = acceptedFiles.map(f => ({
      name: f.name,
      state: 'pending' as const,
    }));
    setFileStatuses(statuses);
    setUploadState('uploading');
    setStatusMessage(`Uploading ${acceptedFiles.length} file${acceptedFiles.length > 1 ? 's' : ''}...`);

    const uploadPromises = acceptedFiles.map(async (file, idx) => {
      // Mark as uploading
      setFileStatuses(prev => prev.map((s, i) => i === idx ? { ...s, state: 'uploading' } : s));

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await axios.post<UploadResponse>('http://localhost:8000/api/upload/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setFileStatuses(prev =>
          prev.map((s, i) => i === idx ? { ...s, state: 'success', message: 'Indexed' } : s)
        );

        if (response.data.paper_id) {
          onUploadSuccess(response.data.paper_id, file.name);
        }

        return true;
      } catch (error: any) {
        const errMsg = error.response?.data?.error || 'Upload failed';
        setFileStatuses(prev =>
          prev.map((s, i) => i === idx ? { ...s, state: 'error', message: errMsg } : s)
        );
        return false;
      }
    });

    const results = await Promise.all(uploadPromises);
    const allSuccess = results.every(Boolean);
    
    setUploadState(allSuccess ? 'success' : 'error');
    setStatusMessage(
      allSuccess
        ? `All ${acceptedFiles.length} files uploaded successfully!`
        : 'Some files failed to upload.'
    );

    // Auto reset
    setTimeout(() => {
      setUploadState('idle');
      setFileStatuses([]);
    }, allSuccess ? 3000 : 5000);
  }, [onUploadSuccess]);

  const onDropRejected = useCallback((fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      setUploadState('error');
      setStatusMessage('Unsupported file type. Accepted: PDF, DOCX, DOC, TXT, MD, EPUB.');
      setTimeout(() => {
        setUploadState('idle');
        setFileStatuses([]);
      }, 4000);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'application/pdf': ['.pdf'],
      'application/epub+zip': ['.epub'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    multiple: true,
    disabled: uploadState === 'uploading' || uploadState === 'success' || uploadState === 'error'
  });

  return (
    <div className="glass-panel p-6 w-full relative overflow-hidden group transition-all duration-300">
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer min-h-[160px]
          ${isDragActive ? 'border-[#F59E0B] bg-amber-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}
          ${uploadState === 'uploading' ? 'opacity-70 cursor-not-allowed' : ''}
          ${uploadState === 'success' ? 'border-green-500/50 bg-green-500/10 cursor-default' : ''}
          ${uploadState === 'error' ? 'border-red-500/50 bg-red-500/10 cursor-default' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {uploadState === 'idle' && (
          <>
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 group-hover:bg-amber-500/20 group-hover:text-[#F59E0B]">
              <UploadCloud className="w-6 h-6 text-gray-300 group-hover:text-[#F59E0B] transition-colors" />
            </div>
            <p className="text-gray-300 font-medium text-center">
              {isDragActive ? "Drop files here..." : "Drag & drop research documents"}
            </p>
            <p className="text-xs text-gray-500 mt-2">PDF, DOCX, DOC, TXT, MD, EPUB — multiple files supported</p>
          </>
        )}

        {uploadState === 'uploading' && (
          <div className="flex flex-col items-center gap-3 w-full max-w-md">
            <Loader className="w-10 h-10 text-[#F59E0B] animate-spin mb-2" />
            <p className="text-gray-300 font-medium">{statusMessage}</p>
            {/* Per-file status list */}
            <div className="w-full flex flex-col gap-1.5 mt-2">
              {fileStatuses.map((fs, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-white/5">
                  <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate flex-1 text-gray-300">{fs.name}</span>
                  {fs.state === 'uploading' && <Loader className="w-3.5 h-3.5 text-[#F59E0B] animate-spin shrink-0" />}
                  {fs.state === 'success' && <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                  {fs.state === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  {fs.state === 'pending' && <div className="w-3.5 h-3.5 rounded-full bg-white/10 shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadState === 'success' && (
          <>
            <CheckCircle className="w-10 h-10 text-green-400 mb-4" />
            <p className="text-gray-300 font-medium">{statusMessage}</p>
          </>
        )}

        {uploadState === 'error' && (
          <>
            <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
            <p className="text-gray-300 font-medium text-sm text-center px-4">{statusMessage}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default UploadZone;
