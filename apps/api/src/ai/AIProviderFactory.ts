import { AIProvider } from './AIProvider';
import { MockAIProvider } from './MockAIProvider';
import { OpenAIProvider } from './OpenAIProvider';

/**
 * AIProviderFactory — reads AI_PROVIDER env var and returns the correct implementation.
 * Swap providers without touching any business logic.
 *
 * AI_PROVIDER=openai → OpenAIProvider
 * AI_PROVIDER=mock   → MockAIProvider (default, works without API key)
 */
export class AIProviderFactory {
  private static instance: AIProvider | null = null;

  static getProvider(): AIProvider {
    if (this.instance) return this.instance;

    const provider = process.env.AI_PROVIDER ?? 'mock';

    switch (provider) {
      case 'openai':
        this.instance = new OpenAIProvider();
        break;
      case 'mock':
      default:
        this.instance = new MockAIProvider();
        break;
    }

    console.log(`[AIProviderFactory] Using provider: ${provider}`);
    return this.instance;
  }
}
