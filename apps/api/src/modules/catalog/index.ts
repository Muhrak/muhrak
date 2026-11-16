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
  listCategories,
  listPublishedProducts,
  sellersMatchingProductText,
  sellersPublishingInCategory,
  type SellerCatalogStats,
} from "./catalog.service";
