import 'package:flutter/material.dart';

/// Public proof-of-ship demo snippet for Move+ Marketplace checkout.
///
/// This is a sanitized checkout demo only.
/// It does not include Supabase, Riverpod, GoRouter, private assets,
/// real customer data, production routes, or wallet secrets.
///
/// Current scope:
/// - Checkout form
/// - Philippines-only delivery note
/// - Choose Payment Method modal
/// - Energy Points payment demo
/// - MiniPay/Celo placeholder
/// - Purchase success receipt
///
/// Production Move+ keeps product catalog, Energy, and delivery off-chain.
/// MiniPay/Celo checkout will be added as a separate crypto payment path.

class CheckoutDemoItem {
  final String title;
  final int energyPrice;
  final IconData icon;

  const CheckoutDemoItem({
    required this.title,
    required this.energyPrice,
    required this.icon,
  });
}

class MarketplaceCheckoutDemoScreen extends StatefulWidget {
  const MarketplaceCheckoutDemoScreen({super.key});

  @override
  State<MarketplaceCheckoutDemoScreen> createState() =>
      _MarketplaceCheckoutDemoScreenState();
}

class _MarketplaceCheckoutDemoScreenState
    extends State<MarketplaceCheckoutDemoScreen> {
  static const Color backgroundColor = Color(0xFF202020);
  static const Color cardColor = Color(0xFF2A2A2A);
  static const Color primaryColor = Color(0xFF73E600);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Color(0xFFB8B8B8);

  static const bool enableMiniPayPlaceholder = true;

  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController(text: 'Demo User');
  final _phoneController = TextEditingController(text: '09XXXXXXXXX');
  final _emailController = TextEditingController(text: 'demo@example.com');
  final _addressController =
      TextEditingController(text: 'Cebu City, Philippines');
  final _commentController = TextEditingController(text: 'Preferred size/color');

  final CheckoutDemoItem item = const CheckoutDemoItem(
    title: 'Ultra-light Waterproof Bag',
    energyPrice: 5600,
    icon: Icons.backpack,
  );

  int demoUserEnergy = 10006;
  bool isSubmitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  String formatEnergy(int value) {
    return value.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
  }

  void handleCheckout() {
    if (!_formKey.currentState!.validate()) return;
    showChoosePaymentMethodModal();
  }

  void showChoosePaymentMethodModal() {
    final bool hasEnoughEnergy = demoUserEnergy >= item.energyPrice;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          decoration: BoxDecoration(
            color: cardColor,
            borderRadius: BorderRadius.circular(22),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
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
                                fontWeight: FontWeight.bold,
                                fontSize: 22,
                              ),
                            ),
                            SizedBox(height: 5),
                            Text(
                              'Philippines delivery only',
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(sheetContext).pop(),
                        icon: const Icon(Icons.close, color: textSecondary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  buildProductSummary(),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Text(
                        'Your Energy: ',
                        style: TextStyle(
                          color: textSecondary,
                          fontSize: 15,
                        ),
                      ),
                      Text(
                        formatEnergy(demoUserEnergy),
                        style: const TextStyle(
                          color: textPrimary,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.bolt, color: primaryColor, size: 18),
                    ],
                  ),
                  const SizedBox(height: 18),
                  buildPaymentOptionCard(
                    title: 'Pay with Energy',
                    description: 'Use Energy Points to redeem this item.',
                    buttonLabel: 'Pay with Energy',
                    enabled: hasEnoughEnergy,
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      handleEnergyPurchase();
                    },
                  ),
                  if (!hasEnoughEnergy) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Not enough Energy Points. You can earn more Energy or use MiniPay when available.',
                      style: TextStyle(
                        color: Colors.orangeAccent,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ],
                  if (enableMiniPayPlaceholder) ...[
                    const SizedBox(height: 12),
                    buildPaymentOptionCard(
                      title: 'Pay with MiniPay',
                      description: 'Pay with supported crypto on Celo.',
                      buttonLabel: 'Coming Soon',
                      enabled: true,
                      isSecondary: true,
                      onPressed: () {
                        Navigator.of(sheetContext).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'MiniPay checkout is coming soon.',
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                  const SizedBox(height: 16),
                  const Center(
                    child: Text(
                      'Available for Philippine delivery only. International delivery will be added later.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: textSecondary,
                        fontSize: 12,
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
          height: 68,
          width: 68,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
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
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 7),
              Row(
                children: [
                  Text(
                    formatEnergy(item.energyPrice),
                    style: const TextStyle(
                      color: primaryColor,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.bolt, color: primaryColor, size: 22),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget buildPaymentOptionCard({
    required String title,
    required String description,
    required String buttonLabel,
    required bool enabled,
    required VoidCallback? onPressed,
    bool isSecondary = false,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: enabled
              ? (isSecondary ? Colors.white24 : primaryColor.withOpacity(0.5))
              : Colors.white10,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: enabled ? textPrimary : textSecondary,
              fontSize: 17,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: const TextStyle(
              color: textSecondary,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: enabled ? onPressed : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: isSecondary ? Colors.white12 : primaryColor,
                foregroundColor: isSecondary ? textPrimary : Colors.black,
                disabledBackgroundColor: Colors.white10,
                disabledForegroundColor: textSecondary,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(
                buttonLabel,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> handleEnergyPurchase() async {
    setState(() => isSubmitting = true);

    await Future<void>.delayed(const Duration(milliseconds: 700));

    if (!mounted) return;

    if (demoUserEnergy < item.energyPrice) {
      setState(() => isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Insufficient Energy Points.'),
        ),
      );
      return;
    }

    setState(() {
      demoUserEnergy -= item.energyPrice;
      isSubmitting = false;
    });

    showPurchaseSuccessDialog(
      paymentMethod: 'Energy Points',
      paid: '${formatEnergy(item.energyPrice)} Energy',
    );
  }

  void showPurchaseSuccessDialog({
    required String paymentMethod,
    required String paid,
  }) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return Dialog(
          backgroundColor: cardColor,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
          ),
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      height: 54,
                      width: 54,
                      decoration: BoxDecoration(
                        color: primaryColor.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.check_circle,
                        color: primaryColor,
                        size: 32,
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
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
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
                const SizedBox(height: 22),
                buildProductSummary(),
                const SizedBox(height: 20),
                const Divider(color: Colors.white12),
                const SizedBox(height: 16),
                buildDetailRow('Name', _nameController.text.trim()),
                buildDetailRow('Email', _emailController.text.trim()),
                buildDetailRow('Delivery', _addressController.text.trim()),
                buildDetailRow('Payment Method', paymentMethod),
                buildDetailRow('Paid', paid),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: backgroundColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, color: primaryColor, size: 22),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Thank you for your purchase. We will contact you once the item is ready to ship. MiniPay/Celo transaction details will appear here after crypto checkout integration.',
                          style: TextStyle(
                            color: textSecondary,
                            fontSize: 12,
                            height: 1.45,
                          ),
                        ),
                      ),
                    ],
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
                        borderRadius: BorderRadius.circular(12),
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

  Widget buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 118,
            child: Text(
              label,
              style: const TextStyle(
                color: textSecondary,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value.isNotEmpty ? value : 'N/A',
              style: const TextStyle(
                color: textPrimary,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget buildInput({
    required String label,
    required TextEditingController controller,
    required String hint,
    int maxLines = 1,
    TextInputType keyboardType = TextInputType.text,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          maxLines: maxLines,
          keyboardType: keyboardType,
          style: const TextStyle(color: textPrimary),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: textSecondary),
            filled: true,
            fillColor: cardColor,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            contentPadding: const EdgeInsets.all(16),
          ),
          validator: validator ??
              (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Required';
                }
                return null;
              },
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        backgroundColor: backgroundColor,
        title: const Text(
          'Checkout',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cardColor,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: buildProductSummary(),
              ),
              const SizedBox(height: 24),
              buildInput(
                label: 'Name',
                controller: _nameController,
                hint: 'Enter your full name',
              ),
              const SizedBox(height: 18),
              buildInput(
                label: 'Phone Number',
                controller: _phoneController,
                hint: 'Enter your phone number',
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 18),
              buildInput(
                label: 'Email Address',
                controller: _emailController,
                hint: 'Enter your email address',
                keyboardType: TextInputType.emailAddress,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Required';
                  }
                  if (!value.contains('@')) {
                    return 'Enter a valid email address';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 18),
              buildInput(
                label: 'Delivery Address',
                controller: _addressController,
                hint: 'Enter your delivery address',
                maxLines: 3,
              ),
              const SizedBox(height: 18),
              buildInput(
                label: 'Comments',
                controller: _commentController,
                hint: 'Input details about the item, size, color, etc.',
                maxLines: 4,
                validator: (_) => null,
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: isSubmitting ? null : handleCheckout,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.grey[800],
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: Colors.grey[700],
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: isSubmitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Checkout',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Philippines delivery only. International delivery will be added later.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: textSecondary,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
