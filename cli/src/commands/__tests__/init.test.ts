import * as fs from 'fs';
import { initCommand } from '../init';
import { getInteractivePrompt, type InteractivePrompt } from '../../utils/interactive-prompt';

jest.mock('fs');
jest.mock('../../utils/interactive-prompt');
jest.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    bold: {
      blue: (str: string) => str
    }
  },
  bold: {
    blue: (str: string) => str
  },
  blue: (str: string) => str,
  green: (str: string) => str,
  red: (str: string) => str,
  gray: (str: string) => str,
  yellow: (str: string) => str,
  cyan: (str: string) => str
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGetInteractivePrompt = getInteractivePrompt as jest.MockedFunction<typeof getInteractivePrompt>;
const mockPrompt = jest.fn();
const interactivePrompt: InteractivePrompt = {
  prompt: mockPrompt as InteractivePrompt['prompt']
};

describe('Init Command', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    jest.clearAllMocks();
    mockPrompt.mockReset();
    mockGetInteractivePrompt.mockReset();
    mockGetInteractivePrompt.mockResolvedValue(interactivePrompt);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('prompts before overwriting an existing initialization', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockPrompt.mockResolvedValueOnce({ overwrite: false });

    await initCommand({});

    expect(mockPrompt).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'confirm',
          name: 'overwrite',
          message: 'Augment Extensions already initialized. Overwrite?'
        })
      ])
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Initialization cancelled.'));
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('falls back cleanly when prompt support is unavailable', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockGetInteractivePrompt.mockResolvedValueOnce(null);

    await initCommand({});

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Interactive prompts are unavailable in this terminal')
    );
    expect(mockPrompt).not.toHaveBeenCalled();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});
