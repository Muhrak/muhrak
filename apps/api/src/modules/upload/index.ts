/**
 * Public surface of the upload module. Other modules import only from here.
 */
export { uploadRouter } from "./upload.routes";
export {
  attachUpload,
  getDownloadLink,
  getOwnedPartPhotoLink,
  getOwnedPhotoForAi,
  getProductPhotoUrls,
  getPublicLogoUrls,
  getUploads,
  readPhotoForAi,
} from "./upload.service";
export type { AiPhotoPurpose } from "./upload.service";
