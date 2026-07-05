import 'package:flutter/material.dart';

/// Public proof-of-ship demo snippet for Move+ Purchase Success receipt.
///
/// This is a sanitized success screen/dialog demo only.
/// It does not include Supabase, private assets, production routes,
/// real customer data, wallet secrets, or real transaction hashes.
///
/// Current status:
/// - Energy Points receipt is active
/// - MiniPay/Celo receipt fields are prepared for future crypto checkout
/// - Philippines delivery only

class PurchaseSuccessDemoItem {
  final String title;
  final int energyPaid;
  final IconData icon;

  const PurchaseSuccessDemoItem({
    required this.title,
    required this.energyPaid,
    required this.icon,
  });
}

class PurchaseSuccessScreenDemo extends StatelessWidget {
  const PurchaseSuccessScreenDemo({super.key});

  static const Color backgroundColor = Color(0xFF202020);
  static const Color cardColor = Color(0xFF2A2A2A);
  static const Color primaryColor = Color(0xFF73E600);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Color(0xFFB8B8B8);

  static const PurchaseSuccessDemoItem demoItem = PurchaseSuccessDemoItem(
    title: '100 Accessories Lock with Key - Grey',
    energyPaid: 1900,
    icon: Icons.lock_outline,
  );

  String formatEnergy(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
  }

  void showEnergySuccessDialog(BuildContext context) {
    showPurchaseSuccessDialog(
      context: context,
      item: demoItem,
      paymentMethod: 'Energy Points',
      paidLabel: '${formatEnergy(demoItem.energyPaid)} Energy',
      network: null,
      token: null,
      txHash: null,
    );
  }

  void showMiniPaySuccessPreview(BuildContext context) {
    showPurchaseSuccessDialog(
      context: context,
      item: demoItem,
      paymentMethod: 'MiniPay',
      paidLabel: '1.00 cUSD',
      network: 'Celo',
      token: 'cUSD',
      txHash: '0x1234...abcd',
    );
  }

  void showPurchaseSuccessDialog({
    required BuildContext context,
    required PurchaseSuccessDemoItem item,
    required String paymentMethod,
    required String paidLabel,
    String? network,
    String? token,
    String? txHash,
  }) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black54,
      builder: (context) {
        return Dialog(
          backgroundColor: cardColor,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Header
                Padding(
                  padding: const EdgeInsets.all(22),
                  child: Row(
                    children: [
                      Container(
                        width: 58,
                        height: 58,
                        decoration: BoxDecoration(
                          color: primaryColor.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(
                          Icons.check_circle,
                          color: primaryColor,
                          size: 34,
                        ),
                      ),
                      const SizedBox(width: 14),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Purchase Successful!',
                              style: TextStyle(
                                color: textPrimary,
                                fontWeight: FontWeight.bold,
                                fontSize: 22,
                              ),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'From MOVE+',
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const Divider(color: Colors.white12, height: 1),

                // Item + receipt details
                Padding(
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 72,
                            height: 72,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(
                              item.icon,
                              color: Colors.black26,
                              size: 38,
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
                                    fontWeight: FontWeight.bold,
                                    fontSize: 17,
                                    height: 1.25,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  paidLabel,
                                  style: const TextStyle(
                                    color: primaryColor,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 18,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      const Divider(color: Colors.white12, height: 1),
                      const SizedBox(height: 18),

                      buildDetailRow('Name', 'Demo User'),
                      buildDetailRow('Email', 'demo@example.com'),
                      buildDetailRow('Delivery', 'Cebu City, Philippines'),
                      buildDetailRow('Payment Method', paymentMethod),
                      buildDetailRow('Paid', paidLabel),

                      if (network != null) buildDetailRow('Network', network),
                      if (token != null) buildDetailRow('Token', token),
                      if (txHash != null) buildDetailRow('Tx Hash', txHash),

                      const SizedBox(height: 18),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: backgroundColor,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.info_outline,
                              color: primaryColor,
                              size: 22,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                txHash == null
                                    ? 'Thank you for your purchase. We will contact you once the item is ready to ship. MiniPay/Celo transaction details will appear here after crypto checkout integration.'
                                    : 'Payment verified on Celo. Your order is pending fulfillment and we will contact you once the item is ready to ship.',
                                style: const TextStyle(
                                  color: textSecondary,
                                  fontSize: 12,
                                  height: 1.45,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const Divider(color: Colors.white12, height: 1),

                // Action
                Padding(
                  padding: const EdgeInsets.all(22),
                  child: SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryColor,
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: const Text(
                        'OK',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
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

  Widget buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 124,
            child: Text(
              label,
              style: const TextStyle(
                color: textSecondary,
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget buildPreviewCard({
    required String title,
    required String description,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        children: [
          Icon(icon, color: primaryColor, size: 52),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: textPrimary,
              fontSize: 21,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            description,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: textSecondary,
              fontSize: 13,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: onTap,
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryColor,
                foregroundColor: Colors.black,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'Preview Receipt',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: backgroundColor,
        title: const Text(
          'Purchase Success Demo',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          buildPreviewCard(
            title: 'Energy Receipt',
            description:
                'Current active receipt for Energy Points marketplace redemption.',
            icon: Icons.bolt,
            onTap: () => showEnergySuccessDialog(context),
          ),
          const SizedBox(height: 18),
          buildPreviewCard(
            title: 'MiniPay Receipt Preview',
            description:
                'Future receipt state after MiniPay/Celo checkout verifies an on-chain payment.',
            icon: Icons.account_balance_wallet,
            onTap: () => showMiniPaySuccessPreview(context),
          ),
          const SizedBox(height: 18),
          const Text(
            'Delivery is currently Philippines only. International delivery can be added later after logistics and payment rules are reviewed.',
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
  }
}
