import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { isAuthorized } from '@/lib/api-auth';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_FILES = 8;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

function withTransforms(url: string): string {
  // Insert f_auto,q_auto into the Cloudinary URL so browsers get WebP automatically
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const files = formData.getAll('files') as File[];
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} images allowed` }, { status: 400 });
  }

  const urls: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: `${file.name} is not an image` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name} exceeds 10 MB limit` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'minaara/products',
      resource_type: 'image',
    });

    urls.push(withTransforms(result.secure_url));
  }

  return NextResponse.json({ urls });
}
