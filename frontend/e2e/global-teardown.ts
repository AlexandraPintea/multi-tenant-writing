import { stopStack } from './stack';

export default function globalTeardown(): void {
  stopStack();
}
