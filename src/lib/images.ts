import fs from "fs";
import path from "path";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"];

export function getImagesFromFolder(folderPath: string): string[] {
  const publicDir = path.join(process.cwd(), "public");
  const fullPath = path.join(publicDir, folderPath);

  try {
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const files = fs.readdirSync(fullPath);
    return files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return IMAGE_EXTENSIONS.includes(ext);
      })
      .sort()
      .map((file) => `${folderPath}/${file}`);
  } catch {
    console.error(`Error reading images from ${folderPath}`);
    return [];
  }
}

export function getImageData(folderPath: string, category: string) {
  const images = getImagesFromFolder(folderPath);
  return images.map((src, index) => ({
    src,
    alt: `${category} - Image ${index + 1}`,
    caption: `${category} - Photo ${index + 1}`,
    category,
  }));
}
