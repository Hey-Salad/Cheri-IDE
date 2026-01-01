export type OpenAIUserContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; mime_type?: string; filename?: string | null; detail?: 'low' | 'high' | 'auto' };

export type OpenAIAssistantContent =
  | { type: 'output_text'; text: string }
  | { type: string; [key: string]: any };

export type OpenAIResponseItem = {
  type?: string;
  role?: string;
  content?: OpenAIUserContent[] | OpenAIAssistantContent[] | string | null;
  call_id?: string;
  name?: string;
  arguments?: any;
  [key: string]: any;
};
