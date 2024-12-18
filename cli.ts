import { Command } from '@cliffy/command';
import { Table } from '@cliffy/table';
import { colors } from '@cliffy/ansi/colors';
import { config } from 'https://deno.land/x/dotenv@v3.2.2/mod.ts';

// Load environment variables
config({ export: true });

interface FileResponse {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  purpose: string;
}

interface Assistant {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
}

class GptFilesClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(
    endpoint: string,
    options: RequestInit = {},
  ) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    return response.json();
  }

  async createAssistant(
    { name, model, description, instructions }: {
      name: string;
      model: string;
      description?: string;
      instructions?: string;
    },
  ): Promise<Assistant> {
    const response = await this.request('/assistants', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        model,
        instructions,
      }),
    });
    return response as Assistant;
  }

  async updateAssistant(
    assistantId: string,
    { name, model, description, instructions }: {
      name?: string;
      model?: string;
      description?: string;
      instructions?: string;
    },
  ): Promise<Assistant> {
    const response = await this.request(
      `/assistants/${assistantId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          model,
          instructions,
        }),
      },
    );
    return response as Assistant;
  }

  async deleteAssistant(assistantId: string) {
    await this.request(`/assistants/${assistantId}`, {
      method: 'DELETE',
    });
  }

  async listAssistants(): Promise<Assistant[]> {
    const resp = await this.request('/assistants', {
      method: 'GET',
    });
    return resp.data as Assistant[];
  }

  async uploadFile({ filePath, assistantId, newFileName }: {
    filePath: string;
    assistantId: string;
    newFileName?: string;
  }) {
    const formData = new FormData();
    const file = await Deno.readFile(filePath);
    const originalFilename = filePath.split('/').pop();
    const uploadFilename = newFileName || originalFilename;

    formData.append('purpose', 'assistants');
    formData.append('file', new Blob([file]), uploadFilename);

    const fileResponse = await this.request('/files', {
      method: 'POST',
      body: formData,
    });

    await this.request(`/assistants/${assistantId}/files`, {
      method: 'POST',
      body: JSON.stringify({ file_id: fileResponse.id }),
    });

    console.log(JSON.stringify(fileResponse, null, 2));

    return fileResponse;
  }

  async listFiles(assistantId: string) {
    return await this.request(`/assistants/${assistantId}/files`);
  }

  async deleteFile(
    { fileId, assistantId }: { fileId: string; assistantId: string },
  ) {
    await this.request(`/assistants/${assistantId}/files/${fileId}`, {
      method: 'DELETE',
    });

    await this.request(`/files/${fileId}`, {
      method: 'DELETE',
    });
  }
}

await new Command()
  .name('gpt-files')
  .version('0.0.3')
  .description('Manage files for OpenAI assistant')
  .globalEnv(
    'OPENAI_API_KEY=<value:string>',
    'OpenAI api key',
    { required: true },
  )
  .globalEnv(
    'OPENAI_ASSISTANT_ID=<value:string>',
    'OpenAI assistant id',
    { required: false },
  )
  .command('create-assistant', 'Create a new assistant.')
  .option(
    '-n, --name <name:string>',
    'Name of the assistant',
    { required: true },
  )
  .option(
    '-m, --model <model:string>',
    'Model for the assistant',
    { required: true },
  )
  .option(
    '-d, --description <description:string>',
    'Description of the assistant',
    { required: false },
  )
  .option(
    '-i, --instructions <instructions:string>',
    'Instructions for the assistant',
    { required: false },
  )
  .action(async (options) => {
    try {
      const client = new GptFilesClient(
        options.openaiApiKey,
      );
      const a = await client.createAssistant(options);
      console.log(
        colors.green('✓'),
        'Assistant created successfully:',
        '\n',
        JSON.stringify(a, null, 2),
      );
    } catch (error: unknown) {
      console.error(colors.red('✗'), 'Error:', error);
      Deno.exit(1);
    }
  })
  .command('update-assistant', 'Update an assistant')
  .arguments('<assistantId:string>')
  .option(
    '-n, --name <name:string>',
    'Name of the assistant',
    { required: false },
  )
  .option(
    '-m, --model <model:string>',
    'Model for the assistant',
    { required: false },
  )
  .option(
    '-d, --description <description:string>',
    'Description of the assistant',
    { required: false },
  )
  .option(
    '-i, --instructions <instructions:string>',
    'Instructions for the assistant',
    { required: false },
  )
  .action(async (options, assistantId) => {
    try {
      const client = new GptFilesClient(
        options.openaiApiKey,
      );
      const a = await client.updateAssistant(assistantId, options);
      console.log(
        colors.green('✓'),
        'Assistant updated successfully:',
        '\n',
        JSON.stringify(a, null, 2),
      );
    } catch (error: unknown) {
      console.error(colors.red('✗'), 'Error:', error);
      Deno.exit(1);
    }
  })
  .command('del-assistant', 'Delete an assistant')
  .arguments('<assistantId:string>')
  .action(async (options, assistantId) => {
    try {
      const client = new GptFilesClient(
        options.openaiApiKey,
      );
      await client.deleteAssistant(assistantId);
      console.log(colors.green('✓'), 'Assistant deleted successfully');
    } catch (error: unknown) {
      console.error(colors.red('✗'), 'Error:', error);
      Deno.exit(1);
    }
  })
  .command('assistants', 'List all assistants')
  .action(async (options) => {
    try {
      const client = new GptFilesClient(
        options.openaiApiKey,
      );
      const assistants = await client.listAssistants();
      const table = new Table()
        .header(['ID', 'Name', 'Description', 'Model', 'Instructions'])
        .body(
          assistants.map((a: Assistant) => [
            a.id,
            a.name,
            a.description,
            a.model,
            a.instructions,
          ]),
        );

      table.render();
    } catch (error: unknown) {
      console.error(colors.red('✗'), 'Error:', error);
      Deno.exit(1);
    }
  })
  .command('upload', 'Upload a file to a assistant')
  .option(
    '-n, --new-name <name:string>',
    'New filename to override the original filename',
  )
  .arguments('<filePath:string>')
  .action(async (options, filePath) => {
    try {
      const client = new GptFilesClient(
        options.openaiApiKey,
      );
      const response = await client.uploadFile({
        filePath,
        assistantId: options.openaiAssistantId!,
        newFileName: options.newName,
      });
      console.log(
        colors.green('✓'),
        'File uploaded successfully:',
        response.id,
      );
    } catch (error: unknown) {
      console.error(colors.red('✗'), 'Error:', error);
      Deno.exit(1);
    }
  })
  .command('list', 'List all files attached to an assistant')
  .action(async (options) => {
    try {
      const client = new GptFilesClient(
        options.openaiApiKey,
      );
      const response = await client.listFiles(
        options.openaiAssistantId!,
      );

      const table = new Table()
        .header(['ID', 'Filename', 'Size', 'Created'])
        .body(
          response.data.map((file: FileResponse) => [
            file.id,
            file.filename,
            `${(file.bytes / 1024).toFixed(2)} KB`,
            new Date(file.created_at * 1000).toLocaleString(),
          ]),
        );

      table.render();
    } catch (error: unknown) {
      console.error(colors.red('✗'), 'Error:', error);
      Deno.exit(1);
    }
  })
  .command('delete', 'Remove a file from an assistant')
  .arguments('<fileId:string>')
  .action(async (options, fileId) => {
    try {
      const client = new GptFilesClient(
        options.openaiApiKey,
      );
      await client.deleteFile({
        fileId,
        assistantId: options.openaiAssistantId!,
      });
      console.log(colors.green('✓'), 'File deleted successfully');
    } catch (error: unknown) {
      console.error(colors.red('✗'), 'Error:', error);
      Deno.exit(1);
    }
  })
  .parse(Deno.args);
