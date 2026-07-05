import 'package:flutter/material.dart';

/// Public proof-of-ship demo snippet for Move+ Marketplace.
///
/// This is a sanitized marketplace UI demo only.
/// It does not include Supabase, private app routes, private assets,
/// wallet logic, notifications, profile data, or production services.
///
/// Current scope:
/// - Real-item marketplace grid
/// - Fitness categories
/// - Energy Points pricing
/// - Price filter
/// - Product detail placeholder
/// - Future MiniPay checkout direction
///
/// Production Move+ app keeps products/orders off-chain.
/// MiniPay/Celo checkout will be added as a separate payment path.

class MarketplaceDemoItem {
  final String title;
  final String category;
  final int energyPrice;
  final IconData icon;

  const MarketplaceDemoItem({
    required this.title,
    required this.category,
    required this.energyPrice,
    required this.icon,
  });
}

class MarketplaceScreenDemo extends StatefulWidget {
  const MarketplaceScreenDemo({super.key});

  @override
  State<MarketplaceScreenDemo> createState() => _MarketplaceScreenDemoState();
}

class _MarketplaceScreenDemoState extends State<MarketplaceScreenDemo> {
  static const Color backgroundColor = Color(0xFF202020);
  static const Color cardColor = Color(0xFF2A2A2A);
  static const Color primaryColor = Color(0xFF73E600);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Color(0xFFB8B8B8);

  final List<String> categories = const [
    'All',
    'Wearables',
    'Apparel',
    'Accessories',
    'Nutrition',
  ];

  final List<MarketplaceDemoItem> allItems = const [
    MarketplaceDemoItem(
      title: 'Move+ Runner Shirt',
      category: 'Apparel',
      energyPrice: 1500,
      icon: Icons.checkroom,
    ),
    MarketplaceDemoItem(
      title: 'Ultra-light Waterproof Bag',
      category: 'Accessories',
      energyPrice: 5600,
      icon: Icons.backpack,
    ),
    MarketplaceDemoItem(
      title: 'Running Shoes',
      category: 'Wearables',
      energyPrice: 35000,
      icon: Icons.directions_run,
    ),
    MarketplaceDemoItem(
      title: 'Cycling Gloves',
      category: 'Wearables',
      energyPrice: 3200,
      icon: Icons.sports_motorsports,
    ),
    MarketplaceDemoItem(
      title: 'Move+ Walker Shirt',
      category: 'Apparel',
      energyPrice: 1500,
      icon: Icons.checkroom,
    ),
    MarketplaceDemoItem(
      title: 'Energy Drink Pack',
      category: 'Nutrition',
      energyPrice: 2400,
      icon: Icons.local_drink,
    ),
  ];

  int selectedCategoryIndex = 0;
  String priceFilter = 'mix';

  List<MarketplaceDemoItem> get filteredItems {
    List<MarketplaceDemoItem> items;

    if (selectedCategoryIndex == 0) {
      items = List.from(allItems);
    } else {
      final selectedCategory = categories[selectedCategoryIndex];
      items = allItems.where((item) => item.category == selectedCategory).toList();
    }

    if (priceFilter == 'lowToHigh') {
      items.sort((a, b) => a.energyPrice.compareTo(b.energyPrice));
    } else if (priceFilter == 'highToLow') {
      items.sort((a, b) => b.energyPrice.compareTo(a.energyPrice));
    }

    return items;
  }

  String formatEnergy(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
  }

  void showPriceFilterDialog() {
    showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: cardColor,
          title: const Text(
            'Filter by Price',
            style: TextStyle(
              color: textPrimary,
              fontWeight: FontWeight.bold,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              buildFilterOption('mix', 'Mix'),
              const SizedBox(height: 8),
              buildFilterOption('lowToHigh', 'Low to High'),
              const SizedBox(height: 8),
              buildFilterOption('highToLow', 'High to Low'),
            ],
          ),
        );
      },
    );
  }

  Widget buildFilterOption(String value, String label) {
    final bool isSelected = priceFilter == value;

    return InkWell(
      onTap: () {
        setState(() {
          priceFilter = value;
        });
        Navigator.pop(context);
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? primaryColor : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? primaryColor : Colors.white24,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.black : textPrimary,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ),
            if (isSelected)
              const Icon(
                Icons.check,
                color: Colors.black,
                size: 18,
              ),
          ],
        ),
      ),
    );
  }

  void showProductDetail(MarketplaceDemoItem item) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black54,
      builder: (context) {
        return Dialog(
          backgroundColor: cardColor,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  height: 220,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Icon(
                    item.icon,
                    size: 90,
                    color: Colors.black26,
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  item.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      formatEnergy(item.energyPrice),
                      style: const TextStyle(
                        color: primaryColor,
                        fontSize: 34,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Icon(
                      Icons.bolt,
                      color: primaryColor,
                      size: 30,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Text(
                  'Energy Points',
                  style: TextStyle(
                    color: textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Philippines delivery only. MiniPay/Celo checkout will be added as a crypto payment option.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textSecondary,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(context);
                      showChoosePaymentMethod(item);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Checkout',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void showChoosePaymentMethod(MarketplaceDemoItem item) {
    const int demoUserEnergy = 10006;
    final bool hasEnoughEnergy = demoUserEnergy >= item.energyPrice;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: cardColor,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(28),
        ),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(22, 22, 22, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Choose Payment Method',
                          style: TextStyle(
                            color: textPrimary,
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        SizedBox(height: 6),
                        Text(
                          'Philippines delivery only',
                          style: TextStyle(
                            color: textSecondary,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(
                      Icons.close,
                      color: textSecondary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Container(
                    height: 72,
                    width: 72,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(
                      item.icon,
                      color: Colors.black26,
                      size: 36,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.title,
                          style: const TextStyle(
                            color: textPrimary,
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Text(
                              formatEnergy(item.energyPrice),
                              style: const TextStyle(
                                color: primaryColor,
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.bolt,
                              color: primaryColor,
                              size: 22,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  const Text(
                    'Your Energy: ',
                    style: TextStyle(
                      color: textSecondary,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    formatEnergy(demoUserEnergy),
                    style: const TextStyle(
                      color: textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.bolt,
                    color: primaryColor,
                    size: 18,
                  ),
                ],
              ),
              const SizedBox(height: 18),
              buildPaymentOption(
                title: 'Pay with Energy',
                description: 'Use Energy Points to redeem this item.',
                buttonLabel: 'Pay with Energy',
                enabled: hasEnoughEnergy,
                onPressed: () {
                  Navigator.pop(context);
                  showDemoSuccess(item);
                },
              ),
              const SizedBox(height: 12),
              buildPaymentOption(
                title: 'Pay with MiniPay',
                description: 'MiniPay/Celo crypto checkout integration in progress.',
                buttonLabel: 'Coming Soon',
                enabled: false,
                onPressed: null,
              ),
              const SizedBox(height: 18),
              const Text(
                'Available for Philippine delivery only. International delivery will be added later.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: textSecondary,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget buildPaymentOption({
    required String title,
    required String description,
    required String buttonLabel,
    required bool enabled,
    required VoidCallback? onPressed,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(
          color: enabled ? primaryColor : Colors.white12,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: enabled ? textPrimary : textSecondary,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: const TextStyle(
              color: textSecondary,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: enabled ? onPressed : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryColor,
                disabledBackgroundColor: Colors.white12,
                foregroundColor: Colors.black,
                disabledForegroundColor: textSecondary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: Text(
                buttonLabel,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void showDemoSuccess(MarketplaceDemoItem item) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black54,
      builder: (context) {
        return Dialog(
          backgroundColor: cardColor,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.check_circle,
                  color: primaryColor,
                  size: 62,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Purchase Successful!',
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  item.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Payment Method: Energy Points',
                  style: const TextStyle(
                    color: textSecondary,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Paid: ${formatEnergy(item.energyPrice)} Energy',
                  style: const TextStyle(
                    color: primaryColor,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Order is pending fulfillment. MiniPay/Celo receipts will be shown here after crypto checkout integration.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textSecondary,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'OK',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void onCategorySelected(int index) {
    setState(() {
      selectedCategoryIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = filteredItems;

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: backgroundColor,
        title: const Text(
          'Marketplace',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            onPressed: showPriceFilterDialog,
            icon: Icon(
              Icons.filter_list,
              color: priceFilter == 'mix' ? Colors.white70 : primaryColor,
            ),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 48,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final bool isSelected = selectedCategoryIndex == index;

                return GestureDetector(
                  onTap: () => onCategorySelected(index),
                  child: Container(
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    decoration: BoxDecoration(
                      color: isSelected ? primaryColor : Colors.white24,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      categories[index],
                      style: TextStyle(
                        color: isSelected ? Colors.black : Colors.white70,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: items.isEmpty
                ? const Center(
                    child: Text(
                      'No products in this category',
                      style: TextStyle(color: textSecondary),
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    itemCount: items.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                      childAspectRatio: 0.72,
                    ),
                    itemBuilder: (context, index) {
                      final item = items[index];

                      return GestureDetector(
                        onTap: () => showProductDetail(item),
                        child: Container(
                          decoration: BoxDecoration(
                            color: cardColor,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Container(
                                  width: double.infinity,
                                  decoration: const BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.vertical(
                                      top: Radius.circular(22),
                                    ),
                                  ),
                                  child: Icon(
                                    item.icon,
                                    size: 64,
                                    color: Colors.black26,
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(12),
                                child: Text(
                                  item.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: textPrimary,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(12, 0, 12, 14),
                                child: Row(
                                  children: [
                                    Text(
                                      formatEnergy(item.energyPrice),
                                      style: const TextStyle(
                                        color: textPrimary,
                                        fontSize: 22,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    const Icon(
                                      Icons.bolt,
                                      color: primaryColor,
                                      size: 22,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
