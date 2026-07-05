import 'package:flutter/material.dart';

/// Public proof-of-ship demo snippet for Move+ insufficient Energy state.
///
/// This is a sanitized dialog demo only.
/// It shows the previous Energy-only blocker before MiniPay/Celo checkout.
///
/// Purpose:
/// - Show why Move+ needs a payment method selector
/// - Show the old limitation: not enough Energy = checkout blocked
/// - Support the hackathon story: MiniPay/Celo gives users another checkout path

class InsufficientEnergyDialogDemo extends StatelessWidget {
  const InsufficientEnergyDialogDemo({super.key});

  static const Color backgroundColor = Color(0xFF202020);
  static const Color cardColor = Color(0xFF2A2A2A);
  static const Color primaryColor = Color(0xFF73E600);
  static const Color warningColor = Color(0xFFFFA000);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Color(0xFFB8B8B8);

  String formatEnergy(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
  }

  void showInsufficientEnergyDialog({
    required BuildContext context,
    required int currentEnergy,
    required int requiredEnergy,
  }) {
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
            padding: const EdgeInsets.all(26),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      color: warningColor,
                      size: 42,
                    ),
                    const SizedBox(width: 18),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Insufficient Energy Points',
                            style: TextStyle(
                              color: textPrimary,
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text(
                            'You have ${formatEnergy(currentEnergy)} Energy Points, but need ${formatEnergy(requiredEnergy)} to purchase this item.',
                            style: const TextStyle(
                              color: textSecondary,
                              fontSize: 16,
                              height: 1.45,
                            ),
                          ),
                          const SizedBox(height: 18),
                          const Text(
                            'Please earn more Energy Points by completing activities.',
                            style: TextStyle(
                              color: textSecondary,
                              fontSize: 16,
                              height: 1.45,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    SizedBox(
                      width: 120,
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
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void showFutureMiniPaySolutionDialog(BuildContext context) {
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
            padding: const EdgeInsets.all(26),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.payments_rounded,
                  color: primaryColor,
                  size: 56,
                ),
                const SizedBox(height: 14),
                const Text(
                  'New Checkout Direction',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Instead of blocking checkout when Energy is not enough, Move+ will show a payment method selector.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textSecondary,
                    fontSize: 15,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 18),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: backgroundColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: const Column(
                    children: [
                      Text(
                        'Energy Points',
                        style: TextStyle(
                          color: textPrimary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'or',
                        style: TextStyle(color: textSecondary),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'MiniPay / Celo Crypto Checkout',
                        style: TextStyle(
                          color: primaryColor,
                          fontWeight: FontWeight.bold,
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

  @override
  Widget build(BuildContext context) {
    const int currentEnergy = 1906;
    const int requiredEnergy = 5600;

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: backgroundColor,
        title: const Text(
          'Insufficient Energy Demo',
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
                    Icons.shopping_bag_rounded,
                    color: primaryColor,
                    size: 54,
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Previous Energy-Only Checkout',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: textPrimary,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'User Energy: ${formatEnergy(currentEnergy)}',
                    style: const TextStyle(
                      color: textSecondary,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Item Price: ${formatEnergy(requiredEnergy)} Energy',
                    style: const TextStyle(
                      color: textSecondary,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'Before MiniPay integration, users without enough Energy were blocked from completing checkout.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: textSecondary,
                      fontSize: 14,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            ElevatedButton(
              onPressed: () {
                showInsufficientEnergyDialog(
                  context: context,
                  currentEnergy: currentEnergy,
                  requiredEnergy: requiredEnergy,
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: warningColor,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'Show Old Blocker',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => showFutureMiniPaySolutionDialog(context),
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryColor,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'Show MiniPay Direction',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
