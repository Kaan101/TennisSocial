import { mkdir, writeFile, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { cloudinaryEnabled, config } from "../../config";

export type StoredImage = { url: string; publicId: string };

export interface ImageStorage {
  upload(input: { data: Buffer; filename: string; mimeType: string }): Promise<StoredImage>;
  delete(publicId: string): Promise<void>;
}

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

export function assertImage(mimeType: string): void {
  if (!allowed.has(mimeType)) {
    throw new Error("Yalnızca JPEG, PNG veya WebP yüklenebilir");
  }
}

class LocalStorage implements ImageStorage {
  async upload(input: { data: Buffer; filename: string; mimeType: string }): Promise<StoredImage> {
    assertImage(input.mimeType);
    await mkdir(config.uploadDir, { recursive: true });
    const ext = extname(input.filename) || (input.mimeType === "image/png" ? ".png" : input.mimeType === "image/webp" ? ".webp" : ".jpg");
    const publicId = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
    await writeFile(join(config.uploadDir, publicId), input.data);
    return { url: `${config.apiPublicUrl}/uploads/${publicId}`, publicId };
  }

  async delete(publicId: string): Promise<void> {
    await unlink(join(config.uploadDir, publicId)).catch(() => undefined);
  }
}

class CloudinaryStorage implements ImageStorage {
  constructor() {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
    });
  }

  async upload(input: { data: Buffer; filename: string; mimeType: string }): Promise<StoredImage> {
    assertImage(input.mimeType);
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "kort", resource_type: "image" },
        (error, uploaded) => {
          if (error || !uploaded) reject(error ?? new Error("Yükleme başarısız"));
          else resolve({ secure_url: uploaded.secure_url, public_id: uploaded.public_id });
        },
      );
      stream.end(input.data);
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}

export const imageStorage: ImageStorage = cloudinaryEnabled() ? new CloudinaryStorage() : new LocalStorage();
