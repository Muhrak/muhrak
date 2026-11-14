/**
 * Public surface of the seller module. Other modules import only from here.
 */
export { sellerRouter } from "./seller.routes";
export {
  getDocumentLinkForAdmin,
  getSellerForAdmin,
  getSellerStatsForAdmin,
  getVerifiedSellerProfile,
  isSellerVerified,
  listVerifiedSellerIds,
  listVerifiedSellersPage,
  type PublicSellerProfile,
  listSellersForAdmin,
  reviewSeller,
} from "./seller.service";
