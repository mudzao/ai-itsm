"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, Upload, FileSpreadsheet, X } from "lucide-react";

type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadStats = {
  total: number;
  processed: number;
  successful: number;
  failed: number;
};

export function TicketUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<UploadStats>({ total: 0, processed: 0, successful: 0, failed: 0 });
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Only accept the first file
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      
      // Check if file is Excel
      if (
        selectedFile.type === "application/vnd.ms-excel" || 
        selectedFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        setFile(selectedFile);
        setStatus("idle");
        setErrorMessage("");
      } else {
        setErrorMessage("Please upload an Excel file (.xls or .xlsx)");
        setStatus("error");
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    maxFiles: 1
  });

  const handleUpload = async () => {
    if (!file) return;

    try {
      setStatus("uploading");
      setProgress(0);
      setStats({ total: 0, processed: 0, successful: 0, failed: 0 });
      setErrorMessage("");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import-tickets", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload tickets");
      }

      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error("Failed to read response stream");
      }

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // Parse the chunk as JSON
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split("\n").filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.type === "progress") {
              setProgress(data.percentage);
              setStats({
                total: data.total,
                processed: data.processed,
                successful: data.successful,
                failed: data.failed
              });
            } else if (data.type === "complete") {
              setProgress(100);
              setStats({
                total: data.total,
                processed: data.total,
                successful: data.successful,
                failed: data.failed
              });
              setStatus("success");
            } else if (data.type === "error") {
              setErrorMessage(data.message);
              setStatus("error");
            }
          } catch (e) {
            console.error("Failed to parse chunk:", e);
          }
        }
      }
    } catch (error: any) {
      setErrorMessage(error.message || "An unexpected error occurred");
      setStatus("error");
    }
  };

  const resetUpload = () => {
    setFile(null);
    setStatus("idle");
    setProgress(0);
    setStats({ total: 0, processed: 0, successful: 0, failed: 0 });
    setErrorMessage("");
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Import Ticket History</CardTitle>
        <CardDescription>
          Upload an Excel file containing ticket history data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status !== "uploading" && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/10"
                : "border-gray-300 hover:border-primary"
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-3">
              {file ? (
                <>
                  <FileSpreadsheet className="h-10 w-10 text-primary" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={(e) => {
                    e.stopPropagation();
                    resetUpload();
                  }}>
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-gray-400" />
                  <div>
                    <p className="font-medium">
                      {isDragActive
                        ? "Drop the Excel file here"
                        : "Drag and drop an Excel file, or click to browse"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Supports .xls and .xlsx files
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {status === "uploading" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Total records: {stats.total}</div>
              <div>Processed: {stats.processed}</div>
              <div className="text-green-600">Successful: {stats.successful}</div>
              <div className="text-red-600">Failed: {stats.failed}</div>
            </div>
          </div>
        )}

        {status === "success" && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Import Successful</AlertTitle>
            <AlertDescription className="text-green-700">
              Successfully imported {stats.successful} tickets.
              {stats.failed > 0 && ` ${stats.failed} records failed to import.`}
            </AlertDescription>
          </Alert>
        )}

        {status === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Import Failed</AlertTitle>
            <AlertDescription>
              {errorMessage || "An error occurred during the import process."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={resetUpload}>
          Reset
        </Button>
        <Button 
          onClick={handleUpload} 
          disabled={!file || status === "uploading"}
        >
          {status === "uploading" ? "Uploading..." : "Upload Tickets"}
        </Button>
      </CardFooter>
    </Card>
  );
} 