import React, { useRef, useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";

interface Props {
  onTextExtracted: (text: string, filename: string) => void;
}

export default function FileUpload({ onTextExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Upload failed");
      }
      const data = await res.json();
      onTextExtracted(data.text, file.name);
    } catch (e: any) {
      setError(e.message ?? "Failed to read file");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.pdf,.docx"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        title="Upload .txt, .pdf or .docx"
        className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40"
      >
        {loading ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
      </button>
      {error && (
        <div className="absolute bottom-full mb-1 left-0 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-2 py-1 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
