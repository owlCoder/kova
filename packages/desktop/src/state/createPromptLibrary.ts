import { join } from 'node:path';
import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import { BoundedTextFile } from '../../../runtime/src/adapters/BoundedTextFile.js';
import { PromptLibraryService } from '../../../runtime/src/presentation/PromptLibraryService.js';
import { writeJson } from './writeJson.js';

export function createPromptLibrary(directory: string): PromptLibraryService {
  const path = join(directory, 'prompt-library.json');
  return new PromptLibraryService({
    async read() {
      try {
        const file = await new BoundedTextFile().read(path, new CancellationSource(), 4_000_000);
        return JSON.parse(file.content) as unknown;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw new Error('The prompt library could not be read. Its saved data has been preserved.');
      }
    },
    write: (library) => writeJson(path, library),
  });
}
