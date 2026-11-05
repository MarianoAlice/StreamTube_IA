import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export interface VideoInspection {
  durationSeconds: number;
  metadata: Record<string, unknown>;
  thumbnail: Buffer;
}

@Injectable()
export class FfmpegService {
  async inspect(source: Buffer): Promise<VideoInspection> {
    const directory = await mkdtemp(join(tmpdir(), 'video-'));
    const sourcePath = join(directory, 'source');
    const thumbnailPath = join(directory, 'thumb.jpg');

    try {
      await writeFile(sourcePath, source);
      const probeOutput = await capture('ffprobe', [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        sourcePath,
      ]);
      const metadata = JSON.parse(probeOutput) as {
        format?: { duration?: string };
      };
      const durationSeconds = Math.round(Number(metadata.format?.duration));
      if (!Number.isFinite(durationSeconds)) {
        throw new Error('ffprobe did not return a duration');
      }

      await capture('ffmpeg', [
        '-y',
        '-i',
        sourcePath,
        '-ss',
        '0',
        '-frames:v',
        '1',
        thumbnailPath,
      ]);
      const thumbnail = await readFile(thumbnailPath);
      return {
        durationSeconds,
        metadata: metadata as Record<string, unknown>,
        thumbnail,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} exited ${code}: ${stderr}`));
      }
    });
  });
}
