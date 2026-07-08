/// Marketplace categories used in the app
class MarketplaceCategories {
  static const List<String> categories = [
    'Wearables',
    'Apparel',
    'Accessories',
    'Nutrition',
    'Recovery',
    'Vouchers',
  ];

  static String getDefaultCategory() => categories[0]; // 'Wearables'
}

