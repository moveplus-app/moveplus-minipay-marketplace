import 'package:flutter/material.dart';

/// Public proof-of-ship demo snippet for Move+ Marketplace item detail modal.
///
/// This is a sanitized floating item detail screen only.
/// It does not include private assets, real product image URLs, production routes,
/// Supabase services, GoRouter, or app-specific theme files.
///
/// Current scope:
/// - Product image placeholder
/// - Product title
/// - Energy Points price
/// - Product description
/// - Philippines-only delivery note
/// - Checkout callback placeholder
///
/// Production Move+ app connects this modal to the checkout form.
/// MiniPay/Celo checkout will be added after payment method selection.

class MarketplaceDialogDemoItem {
  final String title;
  final String description;
  final int energyPrice;
  final IconData icon;
  final String sourceLabel;

  const MarketplaceDialogDemoItem({
    required this.title,
    required this.description,
    required this.energyPrice,
    required this.icon,
    this.sourceLabel = 'Move+ Marketplace',
  });
}

class MarketplaceItemDialogDemo extends StatelessWidget {
  const MarketplaceItemDialogDemo({
    super.key,
    required this.item,
    this.onCheckout,
  });

  final MarketplaceDialogDemoItem item;
  final VoidCallback? onCheckout;

  static const Color backgroundColor = Color(0xFF202020);
  static const Color cardColor = Color(0xFF2A2A2A);
  static const Color primaryColor = Color(0xFF73E600);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Color(0xFFB8B8B8);

  String formatEnergy(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => Navigator.of(context).pop(),
      child: Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: GestureDetector(
          onTap: () {},
          child: Center(
            child: Container(
              width: 326,
              constraints: const BoxConstraints(
                maxHeight: 560,
                minHeight: 438,
              ),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.35),
                    blurRadius: 20,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              width: 303,
                              height: 287,
                              color: Colors.white,
                              child: Icon(
                                item.icon,
                                size: 96,
                                color: Colors.black26,
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            item.title,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: textPrimary,
                              fontSize: 17,
                              height: 1.2,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                formatEnergy(item.energyPrice),
                                style: const TextStyle(
                                  color: primaryColor,
                                  fontSize: 34,
                                  height: 1,
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
                              fontSize: 11,
                              height: 1,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            constraints: const BoxConstraints(
                              maxHeight: 96,
                              minHeight: 52,
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: backgroundColor,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: SingleChildScrollView(
                              child: Text(
                                item.description,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: textSecondary,
                                  fontSize: 12,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: backgroundColor,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  'Product from ${item.sourceLabel}',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: textPrimary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'Available for Philippine delivery only. International delivery will be added later.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: textSecondary,
                                    fontSize: 11,
                                    height: 1.35,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryColor,
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop();

                        if (onCheckout != null) {
                          onCheckout!();
                          return;
                        }

                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Checkout form opens here in the production app.',
                            ),
                          ),
                        );
                      },
                      child: const Text(
                        'CLAIM',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Small standalone demo screen that opens the floating item detail modal.
class MarketplaceItemDialogDemoScreen extends StatelessWidget {
  const MarketplaceItemDialogDemoScreen({super.key});

  static const MarketplaceDialogDemoItem demoItem = MarketplaceDialogDemoItem(
    title: 'Ultra-light Waterproof Bag',
    description:
        'A lightweight fitness and outdoor accessory available through the Move+ real-item marketplace.',
    energyPrice: 5600,
    icon: Icons.backpack,
    sourceLabel: 'Move+ Marketplace',
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MarketplaceItemDialogDemo.backgroundColor,
      appBar: AppBar(
        backgroundColor: MarketplaceItemDialogDemo.backgroundColor,
        title: const Text(
          'Item Detail Demo',
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: Center(
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: MarketplaceItemDialogDemo.primaryColor,
            foregroundColor: Colors.black,
          ),
          onPressed: () {
            showDialog<void>(
              context: context,
              barrierDismissible: true,
              barrierColor: Colors.black54,
              builder: (_) => MarketplaceItemDialogDemo(
                item: demoItem,
              ),
            );
          },
          child: const Text('Open Item Detail'),
        ),
      ),
    );
  }
}
