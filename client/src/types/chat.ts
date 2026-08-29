export interface IUser {
  _id: string;
  username: string;
  displayName: string;
  avatar: string;
  lastSeen?: string | Date;
  createdAt?: string;
  updatedAt?: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'application';

export interface IMessage {
  _id?: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: MessageType;
  fileName?: string;
  timestamp: string | Date;
}

export interface ITheme {
  id: string;
  name: string;
  primary: string;
  bg: string;
  chatBg: string;
  sidebar: string;
  header: string;
  bubble: string;
  text: string;
}

export interface IIncomingCall {
  callerName: string;
  callerId: string;
  channelName: string;
}

export interface IZoomedImage {
  url: string;
  timestamp?: string | Date;
}

export type AuthMode = 'login' | 'register';
