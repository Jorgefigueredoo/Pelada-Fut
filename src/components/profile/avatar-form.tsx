"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { avatarStoragePath, avatarUrl } from "@/lib/avatar";
import { friendlyError } from "@/lib/errors";
import { compressImageToWebp } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/**
 * Uploads straight from the browser to Storage, same as the game screen calls its
 * RPCs straight from the client: one hop less, and the compressed file never has to
 * pass through a Server Action body. `update_my_avatar` is still the only thing that
 * ever writes to `profiles`.
 */
export function AvatarForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(
    avatarUrl(profile.avatar_path, profile.avatar_updated_at),
  );
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string>();

  async function handleFile(file: File) {
    setError(undefined);

    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("Imagem muito grande (máx. 10MB).");
      return;
    }

    setBusy("upload");
    try {
      const blob = await compressImageToWebp(file);
      const path = avatarStoragePath(profile.id);
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data, error: rpcError } = await supabase.rpc("update_my_avatar", {
        p_avatar_path: path,
      });
      if (rpcError) throw rpcError;

      const row = data as { avatar_path: string | null; avatar_updated_at: string | null };
      setPreview(avatarUrl(row.avatar_path, row.avatar_updated_at));
      router.refresh();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(undefined);
    setBusy("remove");
    try {
      const supabase = createClient();
      await supabase.storage.from("avatars").remove([avatarStoragePath(profile.id)]);

      const { error: rpcError } = await supabase.rpc("update_my_avatar", {
        p_avatar_path: null,
      });
      if (rpcError) throw rpcError;

      setPreview(null);
      router.refresh();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg" className="size-16">
        {preview && <AvatarImage src={preview} alt="" />}
        <AvatarFallback className="text-lg">
          {profile.nickname.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === "upload" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="size-4" aria-hidden />
            )}
            {preview ? "Trocar foto" : "Adicionar foto"}
          </Button>

          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={handleRemove}
            >
              {busy === "remove" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Remover
            </Button>
          )}
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
