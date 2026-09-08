type PromptQuestions = readonly unknown[];

export interface InteractivePrompt {
  prompt<T = any>(questions: PromptQuestions): Promise<T>;
}

type InquirerNamespace = {
  prompt?: unknown;
  default?: {
    prompt?: unknown;
  };
};

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<unknown>;

let interactivePromptPromise: Promise<InteractivePrompt | null> | null = null;

function hasInteractiveTerminal(): boolean {
  return Boolean(process.stdin?.isTTY && process.stdout?.isTTY);
}

function resolveInteractivePrompt(moduleValue: unknown): InteractivePrompt | null {
  const candidate = moduleValue as InquirerNamespace | null | undefined;
  const promptOwner =
    typeof candidate?.prompt === 'function'
      ? candidate
      : typeof candidate?.default?.prompt === 'function'
        ? candidate.default
        : null;

  if (!promptOwner || typeof promptOwner.prompt !== 'function') {
    return null;
  }

  return {
    prompt: promptOwner.prompt.bind(promptOwner) as InteractivePrompt['prompt']
  };
}

async function loadInteractivePromptModule(): Promise<InteractivePrompt | null> {
  try {
    const moduleValue = await dynamicImport('inquirer');
    return resolveInteractivePrompt(moduleValue);
  } catch {
    return null;
  }
}

export async function getInteractivePrompt(): Promise<InteractivePrompt | null> {
  if (!hasInteractiveTerminal()) {
    return null;
  }

  if (!interactivePromptPromise) {
    interactivePromptPromise = loadInteractivePromptModule();
  }

  return interactivePromptPromise;
}
