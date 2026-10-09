import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';

/** Bound nesting before class-transformer recursively walks an untrusted request body. */
@Injectable()
export class JsonDepthPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') return value;
    const pending = [{ value, depth: 0 }];
    let nodes = 0;
    while (pending.length) {
      const current = pending.pop()!;
      if (current.value === null || typeof current.value !== 'object') continue;
      nodes += 1;
      if (current.depth > 32 || nodes > 10_000) {
        throw new BadRequestException(
          'Request JSON structure exceeds supported limits',
        );
      }
      for (const nested of Object.values(current.value))
        pending.push({ value: nested, depth: current.depth + 1 });
    }
    return value;
  }
}
