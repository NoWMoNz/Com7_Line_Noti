/** ชนิดข้อมูล LINE Messaging API เท่าที่ระบบใช้ */

// Flex Message เป็น JSON โครงสร้างลึก — ใช้ชนิดหลวมๆ แทนการประกาศครบทุก component
export type FlexComponent = Record<string, unknown>;
export interface FlexBubble {
  type: 'bubble';
  [key: string]: unknown;
}
export interface FlexCarousel {
  type: 'carousel';
  contents: FlexBubble[];
}

export type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'flex'; altText: string; contents: FlexBubble | FlexCarousel };

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string };
  postback?: { data: string };
  webhookEventId?: string;
  deliveryContext?: { isRedelivery: boolean };
}

export interface LineWebhookBody {
  destination?: string;
  events: LineEvent[];
}

export interface LineContent {
  bytes: Uint8Array;
  contentType: string;
}

/** สิ่งที่ handler ต้องใช้จาก LINE — แยกเป็น interface เพื่อให้เขียน test ได้โดยไม่ยิง LINE จริง */
export interface LineApi {
  reply(replyToken: string, messages: LineMessage[]): Promise<void>;
  push(to: string, messages: LineMessage[]): Promise<boolean>;
  getContent(messageId: string): Promise<LineContent | null>;
}
