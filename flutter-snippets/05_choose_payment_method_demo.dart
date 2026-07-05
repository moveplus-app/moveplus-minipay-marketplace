import 'package:flutter/material.dart';

/// Public proof-of-ship demo snippet for Move+ Choose Payment Method.
///
/// This is a sanitized UI demo only.
/// It does not run MiniPay/Celo transactions yet.
///
/// Current status:
/// - Energy Points payment option is active
/// - MiniPay/Celo payment option is shown as integration in progress
/// - Philippines delivery only
///
/// This prepares the marketplace checkout for a future MiniPay stablecoin
/// payment adapter without changing the existing Energy checkout path.

class ChoosePaymentDemoItem {
  final String title;
  final int energyPrice;
  final IconData icon;

  const ChoosePaymentDemoItem({
    required this.title,
    required this.energyPrice,
    required this.icon,
  });
}

class ChoosePaymentMethodDemo extends StatefulWidget {
  const ChoosePaymentMethodDemo({super.key});

  @override
  State<ChoosePaymentMethodDemo> createState() =>
      _ChoosePaymentMethodDemoState();
}

class _ChoosePaymentMethodDemoState extends State<ChoosePaymentMethodDemo> {
  static const Color backgroundColor = Color(0xFF202020);
  static const Color cardColor = Color(0xFF2A2A2A);
  static const Color primaryColor = Color(0xFF73E600);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Color(0xFFB8B8B8);

  final ChoosePaymentDemoItem item = const ChoosePaymentDemoItem(
    title: '100 Accessories Lock with Key - Grey',
    energyPrice: 1900,
    icon: Icons.lock_outline,
  );

  int userEnergy = 10006;

  String formatEnergy(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
  }

  void showChoosePaymentMethod() {
    final bool hasEnoughEnergy = userEnergy >= item.energyPrice;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          decoration: BoxDecoration(
            color: cardColor,
            borderRadius: BorderRadius.circular(24),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
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
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: const Icon(
                          Icons.close,
                          color: textSecondary,
                          size: 30,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  buildProductSummary(),
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
                        formatEnergy(userEnergy),
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
                        size: 20,
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  buildPaymentCard(
                    title: 'Pay with Energy',
                    description: 'Use Energy Points to redeem this item.',
                    status: hasEnoughEnergy
                        ? 'Available'
                        : 'Not enough Energy Points',
                    buttonLabel: 'Pay with Energy',
                    enabled: hasEnoughEnergy,
                    highlighted: true,
                    onPressed: () {
                      Navigator.pop(sheetContext);
                      showEnergySuccessDialog();
                    },
                  ),
                  const SizedBox(height: 14),
                  buildPaymentCard(
                    title: 'Pay with MiniPay',
                    description:
                        'Pay with supported stablecoin on Celo using MiniPay.',
                    status: 'Integration in progress',
                    buttonLabel: 'Coming Soon',
                    enabled: true,
                    highlighted: false,
                    onPressed: () {
                      Navigator.pop(sheetContext);
                      showMiniPayComingSoonDialog();
                    },
                  ),
                  const SizedBox(height: 18),
                  const Center(
                    child: Text(
                      'Available for Philippine delivery only. International delivery will be added later.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: textSecondary,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget buildProductSummary() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 76,
          height: 76,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Icon(
            item.icon,
            size: 40,
            color: Colors.black26,
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
                  fontSize: 18,
                  height: 1.25,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    formatEnergy(item.energyPrice),
                    style: const TextStyle(
                      color: primaryColor,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 5),
                  const Icon(
                    Icons.bolt,
                    color: primaryColor,
                    size: 24,
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget buildPaymentCard({
    required String title,
    required String description,
    required String status,
    required String buttonLabel,
    required bool enabled,
    required bool highlighted,
    required VoidCallback onPressed,
  }) {
    final Color borderColor =
        highlighted ? primaryColor.withOpacity(0.6) : Colors.white24;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: enabled ? borderColor : Colors.white10,
          width: highlighted ? 1.3 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                highlighted ? Icons.bolt : Icons.account_balance_wallet,
                color: highlighted ? primaryColor : Colors.white70,
                size: 22,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: enabled ? textPrimary : textSecondary,
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            description,
            style: const TextStyle(
              color: textSecondary,
              fontSize: 14,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            status,
            style: TextStyle(
              color: highlighted ? primaryColor : textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: enabled ? onPressed : null,
              style: ElevatedButton.styleFrom(
                backgroundColor:
                    highlighted ? primaryColor : Colors.white.withOpacity(0.12),
                foregroundColor: highlighted ? Colors.black : textPrimary,
                disabledBackgroundColor: Colors.white10,
                disabledForegroundColor: textSecondary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: Text(
                buttonLabel,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void showEnergySuccessDialog() {
    setState(() {
      userEnergy -= item.energyPrice;
    });

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
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.check_circle,
                  color: primaryColor,
                  size: 62,
                ),
                const SizedBox(height: 14),
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
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 14),
                buildSuccessRow('Payment Method', 'Energy Points'),
                buildSuccessRow(
                  'Paid',
                  '${formatEnergy(item.energyPrice)} Energy',
                ),
                buildSuccessRow('Delivery', 'Philippines only'),
                const SizedBox(height: 18),
                const Text(
                  'Order is pending fulfillment. MiniPay/Celo transaction details will appear here after crypto checkout integration.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textSecondary,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 22),
                SizedBox(
                  width: double.infinity,
                  height: 48,
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
                      style: TextStyle(fontWeight: FontWeight.bold),
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

  void showMiniPayComingSoonDialog() {
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
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.account_balance_wallet,
                  color: primaryColor,
                  size: 58,
                ),
                const SizedBox(height: 14),
                const Text(
                  'MiniPay Checkout',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'MiniPay/Celo checkout is being integrated as the crypto payment option for Move+ real-item marketplace orders.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textSecondary,
                    fontSize: 14,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: backgroundColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: const Column(
                    children: [
                      Text(
                        'Target Flow',
                        style: TextStyle(
                          color: textPrimary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(height: 10),
                      Text(
                        'Checkout → MiniPay → Celo payment → on-chain receipt → order confirmed',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: textSecondary,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                SizedBox(
                  width: double.infinity,
                  height: 48,
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
                      style: TextStyle(fontWeight: FontWeight.bold),
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

  Widget buildSuccessRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 125,
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

  @override
  Widget build(BuildContext context) {
    final bool hasEnoughEnergy = userEnergy >= item.energyPrice;

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: backgroundColor,
        title: const Text(
          'Choose Payment Demo',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.shopping_bag,
                    color: primaryColor,
                    size: 54,
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Move+ Payment Selector',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: textPrimary,
                      fontSize: 23,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    item.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: textSecondary,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    '${formatEnergy(item.energyPrice)} Energy',
                    style: const TextStyle(
                      color: primaryColor,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    hasEnoughEnergy
                        ? 'Energy payment is available.'
                        : 'Energy is not enough. MiniPay will become the alternate crypto checkout path.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: textSecondary,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            ElevatedButton(
              onPressed: showChoosePaymentMethod,
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryColor,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'Open Choose Payment Method',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
