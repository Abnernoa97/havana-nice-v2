// The view model is shared by musician Chat and the Admin viewer.
// Selection, upload and R2 storage retain their own independent types.
export type ChatMedia={
 assetId:string;
 kind:'photo'|'video';
 mimeType:string;
 sizeBytes:number;
 name:string;
};
