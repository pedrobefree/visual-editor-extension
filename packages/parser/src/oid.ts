import { customAlphabet } from 'nanoid';

const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-._:';
const generate = customAlphabet(VALID_CHARS, 7);

export function createOid(): string {
    return generate();
}
