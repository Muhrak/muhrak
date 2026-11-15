/**
 * Public surface of the catalog module. Other modules import only from here.
 */
export { catalogRouter, sellerProductsRouter } from "./catalog.routes";
export {
  countSellersPerCategory,
  getLiveProductForRfq,
  getProductSnapshots,
  getSellerCatalogStats,
  searchLiveProducts,
  type LiveProductMatch,
  listPublishedProducts,
  sellersMatchingProductText,
  sellersPublishingInCategory,
  type SellerCatalogStats,
} from "./catalog.service";
