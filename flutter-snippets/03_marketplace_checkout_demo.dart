import 'package:flutter/material.dart';
import 'marketplace_item_detail_screen.dart';
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

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'marketplace_item_detail_screen.dart';

class MarketplaceCheckoutScreen extends ConsumerStatefulWidget {
  final MarketplaceTileData? itemData;
  final MarketplaceItemModel? item;

  const MarketplaceCheckoutScreen({
    super.key,
    this.itemData,
    this.item,
  });

  @override
  ConsumerState<MarketplaceCheckoutScreen> createState() => _MarketplaceCheckoutScreenState();
}

class _MarketplaceCheckoutScreenState extends ConsumerState<MarketplaceCheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  final _commentController = TextEditingController();
  final _supabaseService = SupabaseService();
  final _minipayCheckoutService = MinipayCheckoutService();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  String _formatPrice(int price) {
    return price.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
  }

  Future<void> _handleCheckout() async {
    if (!_formKey.currentState!.validate()) return;

    if (widget.item == null && widget.itemData == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Error: No item selected'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (widget.item == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cannot process checkout: Item data not available'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      if (!_supabaseService.isInitialized) {
        await _supabaseService.initialize();
      }

      final currentPoints = await _supabaseService.getCurrentUserEnergyPoints();
      if (!mounted) return;

      await _showChoosePaymentMethodModal(
        item: widget.item!,
        currentEnergy: currentPoints,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error preparing checkout: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    }
  }

  Future<void> _showChoosePaymentMethodModal({
    required MarketplaceItemModel item,
    required int currentEnergy,
  }) async {
    final energyPrice = item.energyPointsPrice;
    final hasEnoughEnergy = currentEnergy >= energyPrice;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: Container(
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            decoration: BoxDecoration(
              color: AppTheme.placeholderColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Header
                  Container(
                    padding: const EdgeInsets.fromLTRB(20, 20, 12, 16),
                    decoration: const BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: Colors.white10, width: 1),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Choose Payment Method',
                                style: GoogleFonts.inter(
                                  color: AppTheme.textPrimary,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 18,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Philippines delivery only',
                                style: GoogleFonts.inter(
                                  color: AppTheme.textSecondary,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.of(sheetContext).pop(),
                          icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Product summary
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildItemThumbnail(item, size: 60),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.title,
                                    style: GoogleFonts.inter(
                                      color: AppTheme.textPrimary,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      Text(
                                        _formatPrice(energyPrice),
                                        style: GoogleFonts.inter(
                                          color: AppTheme.primaryColor,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 16,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Image.asset(
                                        'assets/icons/ic_energy.png',
                                        width: 16,
                                        height: 16,
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Text(
                              'Your Energy: ',
                              style: GoogleFonts.inter(
                                color: AppTheme.textSecondary,
                                fontSize: 13,
                              ),
                            ),
                            Text(
                              _formatPrice(currentEnergy),
                              style: GoogleFonts.inter(
                                color: AppTheme.textPrimary,
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Image.asset(
                              'assets/icons/ic_energy.png',
                              width: 14,
                              height: 14,
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        // Pay with Energy
                        _buildPaymentOptionCard(
                          title: 'Pay with Energy',
                          description: 'Use Energy Points to redeem this item.',
                          enabled: hasEnoughEnergy,
                          onTap: hasEnoughEnergy
                              ? () {
                                  Navigator.of(sheetContext).pop();
                                  _handleEnergyPurchase();
                                }
                              : null,
                        ),
                        if (!hasEnoughEnergy) ...[
                          const SizedBox(height: 8),
                          Text(
                            AppConfig.enableCeloCheckout
                                ? 'Not enough Energy Points. You can earn more Energy or use MiniPay when available.'
                                : 'Not enough Energy Points. You can earn more Energy by completing activities.',
                            style: GoogleFonts.inter(
                              color: Colors.orange.shade300,
                              fontSize: 11,
                              height: 1.4,
                            ),
                          ),
                        ],
                        if (AppConfig.enableCeloCheckout) ...[
                          const SizedBox(height: 12),
                          _buildPaymentOptionCard(
                            title: AppConfig.isNativeMinipayCheckoutEnabled
                                ? 'Continue to MiniPay'
                                : 'MiniPay checkout',
                            description: AppConfig.isNativeMinipayCheckoutEnabled
                                ? 'Pay with supported stablecoin on Celo via MiniPay.'
                                : 'MiniPay payments will be available after Move+ Marketplace Mini App approval.',
                            subtitle: AppConfig.isNativeMinipayCheckoutEnabled
                                ? 'Celo stablecoin · Philippines delivery'
                                : 'Coming soon after MiniPay marketplace approval.',
                            enabled: AppConfig.isNativeMinipayCheckoutEnabled,
                            onTap: AppConfig.isNativeMinipayCheckoutEnabled
                                ? () {
                                    Navigator.of(sheetContext).pop();
                                    _handleMinipayCheckout(item);
                                  }
                                : null,
                          ),
                        ],
                        const SizedBox(height: 16),
                        Text(
                          'Available for Philippine delivery only. International delivery will be added later.',
                          style: GoogleFonts.inter(
                            color: AppTheme.textSecondary,
                            fontSize: 11,
                            height: 1.4,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
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

  Widget _buildItemThumbnail(MarketplaceItemModel item, {required double size}) {
    if (item.imageUrl != null && item.imageUrl!.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: item.imageUrl!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          placeholder: (context, url) => Container(
            width: size,
            height: size,
            color: AppTheme.backgroundColor,
            child: const Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.primaryColor,
              ),
            ),
          ),
          errorWidget: (context, url, error) => Container(
            width: size,
            height: size,
            color: AppTheme.backgroundColor,
            child: Icon(
              Icons.image_not_supported,
              color: AppTheme.textSecondary,
              size: size * 0.4,
            ),
          ),
        ),
      );
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppTheme.backgroundColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(
        Icons.shopping_bag,
        color: AppTheme.textSecondary,
        size: size * 0.4,
      ),
    );
  }

  Widget _buildPaymentOptionCard({
    required String title,
    required String description,
    required bool enabled,
    VoidCallback? onTap,
    String? subtitle,
    bool isSecondary = false,
  }) {
    return Material(
      color: AppTheme.backgroundColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: enabled
                  ? (isSecondary ? Colors.white24 : AppTheme.primaryColor.withOpacity(0.4))
                  : Colors.white10,
              width: 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GoogleFonts.inter(
                  color: enabled ? AppTheme.textPrimary : AppTheme.textSecondary,
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                description,
                style: GoogleFonts.inter(
                  color: AppTheme.textSecondary,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: GoogleFonts.inter(
                    color: AppTheme.primaryColor.withOpacity(0.8),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
              if (enabled && !isSecondary) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: onTap,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.black,
                      disabledBackgroundColor: Colors.grey[700],
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(
                      title,
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _minipayDialogRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: GoogleFonts.inter(
                color: AppTheme.textSecondary,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.inter(
                color: AppTheme.textPrimary,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _handleMinipayCheckout(MarketplaceItemModel item) async {
    if (!AppConfig.isNativeMinipayCheckoutEnabled) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'MiniPay checkout is coming soon.',
              style: GoogleFonts.inter(fontSize: 14),
            ),
            backgroundColor: AppTheme.placeholderColor,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 3),
          ),
        );
      }
      return;
    }

    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      if (!_supabaseService.isInitialized) {
        await _supabaseService.initialize();
      }

      final session = await _minipayCheckoutService.createSession(
        marketplaceItemId: item.id,
        customerName: _nameController.text.trim(),
        phoneNumber: _phoneController.text.trim(),
        email: _emailController.text.trim(),
        deliveryAddress: _addressController.text.trim(),
        comments: _commentController.text.trim().isNotEmpty
            ? _commentController.text.trim()
            : null,
      );

      if (!mounted) return;

      final checkoutUri = Uri.parse(session.checkoutUrl);
      final launched = await launchMinipayCheckoutDeeplink(checkoutUri);

      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Could not open MiniPay. Copy the checkout link and try opening it inside MiniPay.',
              style: GoogleFonts.inter(fontSize: 14),
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      if (mounted) {
        await _showMinipayPendingDialog(session, item);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('MiniPay checkout error: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Future<void> _showMinipayPendingDialog(
    MinipayCheckoutSession session,
    MarketplaceItemModel item,
  ) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) {
        final maxDialogHeight = MediaQuery.of(dialogContext).size.height * 0.75;

        return AlertDialog(
          backgroundColor: AppTheme.placeholderColor,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          contentPadding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          actionsPadding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          title: Text(
            'Complete payment in MiniPay',
            style: GoogleFonts.inter(
              color: AppTheme.textPrimary,
              fontWeight: FontWeight.w600,
              fontSize: 18,
            ),
          ),
          content: SizedBox(
            width: double.maxFinite,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: maxDialogHeight),
              child: SafeArea(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'This payment must be confirmed inside MiniPay. If the checkout opens in Chrome or a normal browser, MiniPay wallet signing will not be available. Tap Open in MiniPay, or copy the link and try opening it inside MiniPay. Return here after payment and tap Check Payment Status.',
                        style: GoogleFonts.inter(
                          color: AppTheme.textSecondary,
                          fontSize: 13,
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'MiniPay provider access may require the checkout URL to be approved or listed by MiniPay.',
                        style: GoogleFonts.inter(
                          color: AppTheme.textSecondary,
                          fontSize: 11,
                          height: 1.4,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                      const SizedBox(height: 16),
                      _minipayDialogRow('Amount', session.amountDisplay),
                      _minipayDialogRow('Token', session.tokenSymbol),
                      _minipayDialogRow('Network', session.chainName),
                      _minipayDialogRow('Delivery', 'Philippines only'),
                    ],
                  ),
                ),
              ),
            ),
          ),
          actions: [
            SizedBox(
              width: double.infinity,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  OutlinedButton(
                    onPressed: () async {
                      final checkoutUri = Uri.parse(session.checkoutUrl);
                      final opened = await launchMinipayCheckoutDeeplink(checkoutUri);
                      if (!opened && dialogContext.mounted) {
                        ScaffoldMessenger.of(dialogContext).showSnackBar(
                          SnackBar(
                            content: Text(
                              'Could not open MiniPay. Copy the checkout link and try opening it inside MiniPay.',
                              style: GoogleFonts.inter(fontSize: 13),
                            ),
                            behavior: SnackBarBehavior.floating,
                            duration: const Duration(seconds: 5),
                          ),
                        );
                      }
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.textPrimary,
                      side: const BorderSide(color: Colors.white24),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(
                      'Open in MiniPay',
                      style: GoogleFonts.inter(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(text: session.checkoutUrl),
                      );
                      if (dialogContext.mounted) {
                        ScaffoldMessenger.of(dialogContext).showSnackBar(
                          SnackBar(
                            content: Text(
                              'Checkout link copied.',
                              style: GoogleFonts.inter(fontSize: 13),
                            ),
                            behavior: SnackBarBehavior.floating,
                            duration: const Duration(seconds: 2),
                          ),
                        );
                      }
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primaryColor,
                      side: BorderSide(color: AppTheme.primaryColor.withOpacity(0.5)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(
                      'Copy Checkout Link',
                      style: GoogleFonts.inter(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: () async {
                      Navigator.of(dialogContext).pop();
                      await _checkMinipayPaymentStatus(session, item);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(
                      'Check Payment Status',
                      style: GoogleFonts.inter(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    child: Text(
                      'Close',
                      style: GoogleFonts.inter(color: AppTheme.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _checkMinipayPaymentStatus(
    MinipayCheckoutSession session,
    MarketplaceItemModel item,
  ) async {
    try {
      final status = await _minipayCheckoutService.checkStatus(
        sessionId: session.sessionId,
        sessionToken: session.sessionToken,
      );

      if (!mounted) return;

      if (status.isPaid) {
        _showMinipaySuccessDialog(item, status);
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(status.userMessage),
          backgroundColor: status.isExpired ? Colors.orange.shade800 : AppTheme.placeholderColor,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: status.isExpired ? 5 : 4),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not check payment status: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showMinipaySuccessDialog(
    MarketplaceItemModel item,
    MinipayCheckoutStatus status,
  ) {
    final txHash = status.txHash ?? '';
    final shortTx = txHash.length > 14
        ? '${txHash.substring(0, 8)}…${txHash.substring(txHash.length - 6)}'
        : txHash;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.placeholderColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        contentPadding: EdgeInsets.zero,
        content: Container(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.white10)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppTheme.primaryColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.check_circle,
                        color: AppTheme.primaryColor,
                        size: 28,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Payment Successful!',
                            style: GoogleFonts.inter(
                              color: AppTheme.textPrimary,
                              fontWeight: FontWeight.w600,
                              fontSize: 18,
                            ),
                          ),
                          Text(
                            'From MOVE+ · MiniPay',
                            style: GoogleFonts.inter(
                              color: AppTheme.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: GoogleFonts.inter(
                        color: AppTheme.textPrimary,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildDetailRow('Payment Method', status.paymentMethod ?? 'MiniPay'),
                    const SizedBox(height: 8),
                    _buildDetailRow('Paid', status.amountDisplay ?? '—'),
                    const SizedBox(height: 8),
                    _buildDetailRow('Token', status.tokenSymbol ?? 'cUSD'),
                    const SizedBox(height: 8),
                    _buildDetailRow('Chain', status.chain ?? 'Celo'),
                    if (shortTx.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _buildDetailRow('Tx Hash', shortTx),
                    ],
                    const SizedBox(height: 8),
                    _buildDetailRow('Order Status', 'Pending fulfillment'),
                    const SizedBox(height: 12),
                    Text(
                      'Philippines delivery only. We will contact you once the item is ready to ship.',
                      style: GoogleFonts.inter(
                        color: AppTheme.textSecondary,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Colors.white10)),
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      context.go('/marketplace');
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(
                      'OK',
                      style: GoogleFonts.inter(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleEnergyPurchase() async {
    if (widget.item == null) return;

    setState(() => _isSubmitting = true);

    try {
      if (!_supabaseService.isInitialized) {
        await _supabaseService.initialize();
      }

      final itemId = widget.item!.id;
      final energyPoints = widget.item!.energyPointsPrice;

      if (!MarketplaceOffer.isPurchasable(widget.item!)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                MarketplaceOffer.isExpired(widget.item!)
                    ? 'This offer has expired.'
                    : 'This product is no longer available.',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      final userId = _supabaseService.currentUserId;
      if (userId != null) {
        final currentPoints = await _supabaseService.getCurrentUserEnergyPoints();
        if (currentPoints < energyPoints) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  'Insufficient Energy Points. You have $currentPoints but need $energyPoints.',
                ),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
      }

      final purchaseDetails = await _supabaseService.createPurchase(
        marketplaceItemId: itemId,
        energyPointsPaid: energyPoints,
        customerName: _nameController.text.trim(),
        phoneNumber: _phoneController.text.trim(),
        email: _emailController.text.trim(),
        deliveryAddress: _addressController.text.trim(),
        comments: _commentController.text.trim().isNotEmpty
            ? _commentController.text.trim()
            : null,
      );

      if (mounted && purchaseDetails != null) {
        ref.invalidate(profileProvider);
        _showPurchaseSuccessDialog(purchaseDetails);
      }
    } catch (e) {
      if (mounted) {
        final message = e.toString().contains('OFFER_EXPIRED')
            ? 'This offer has expired.'
            : 'Error processing checkout: $e';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  void _showPurchaseSuccessDialog(Map<String, dynamic> purchaseDetails) {
    final itemTitle = purchaseDetails['itemTitle'] as String? ?? 'Item';
    final itemImageUrl = purchaseDetails['itemImageUrl'] as String?;
    final energyPointsPaid = purchaseDetails['energyPointsPaid'] as int? ?? 0;
    final customerName = purchaseDetails['customerName'] as String? ?? '';
    final email = purchaseDetails['email'] as String? ?? '';
    final deliveryAddress = purchaseDetails['deliveryAddress'] as String? ?? '';
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.placeholderColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        contentPadding: EdgeInsets.zero,
        content: Container(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header with icon
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: Colors.white10, width: 1),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppTheme.primaryColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.check_circle,
                        color: AppTheme.primaryColor,
                        size: 28,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Purchase Successful!',
                            style: GoogleFonts.inter(
                              color: AppTheme.textPrimary,
                              fontWeight: FontWeight.w600,
                              fontSize: 18,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'From MOVE+',
                            style: GoogleFonts.inter(
                              color: AppTheme.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // Purchase Details
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Item Image and Title
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (itemImageUrl != null && itemImageUrl.isNotEmpty)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: CachedNetworkImage(
                              imageUrl: itemImageUrl,
                              width: 60,
                              height: 60,
                              fit: BoxFit.cover,
                              placeholder: (context, url) => Container(
                                width: 60,
                                height: 60,
                                color: AppTheme.placeholderColor,
                                child: const Center(
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppTheme.primaryColor,
                                  ),
                                ),
                              ),
                              errorWidget: (context, url, error) => Container(
                                width: 60,
                                height: 60,
                                color: AppTheme.placeholderColor,
                                child: Icon(
                                  Icons.image_not_supported,
                                  color: AppTheme.textSecondary,
                                  size: 24,
                                ),
                              ),
                            ),
                          )
                        else
                          Container(
                            width: 60,
                            height: 60,
                            decoration: BoxDecoration(
                              color: AppTheme.placeholderColor,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(
                              Icons.shopping_bag,
                              color: AppTheme.textSecondary,
                              size: 24,
                            ),
                          ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                itemTitle,
                                style: GoogleFonts.inter(
                                  color: AppTheme.textPrimary,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Text(
                                    energyPointsPaid.toString().replaceAllMapped(
                                      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
                                      (Match m) => '${m[1]},',
                                    ),
                                    style: GoogleFonts.inter(
                                      color: AppTheme.primaryColor,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  Image.asset(
                                    'assets/icons/ic_energy.png',
                                    width: 16,
                                    height: 16,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    // Divider
                    Divider(color: Colors.white10, height: 1),
                    const SizedBox(height: 20),
                    // Customer Details
                    _buildDetailRow('Name', customerName),
                    const SizedBox(height: 12),
                    _buildDetailRow('Email', email),
                    const SizedBox(height: 12),
                    _buildDetailRow('Delivery Address', deliveryAddress),
                    const SizedBox(height: 12),
                    _buildDetailRow('Payment Method', 'Energy Points'),
                    const SizedBox(height: 12),
                    _buildDetailRow(
                      'Paid',
                      '${_formatPrice(energyPointsPaid)} Energy',
                    ),
                    const SizedBox(height: 20),
                    // Message from MOVE+
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.backgroundColor,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.white10, width: 1),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.info_outline,
                            color: AppTheme.primaryColor,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Thank you for your purchase! We will contact you once the item is ready to ship. Please check your email for updates.',
                              style: GoogleFonts.inter(
                                color: AppTheme.textSecondary,
                                fontSize: 12,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // Action Button
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Colors.white10, width: 1),
                  ),
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.of(context).pop(); // Close dialog
                      context.go('/marketplace'); // Navigate back to marketplace
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(
                      'OK',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w600,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: Text(
            label,
            style: GoogleFonts.inter(
              color: AppTheme.textSecondary,
              fontSize: 12,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value.isNotEmpty ? value : 'N/A',
            style: GoogleFonts.inter(
              color: AppTheme.textPrimary,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        backgroundColor: AppTheme.backgroundColor,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/marketplace');
            }
          },
        ),
        title: Text(
          'Checkout',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Item Preview
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.placeholderColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: widget.item != null && widget.item!.imageUrl != null && widget.item!.imageUrl!.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: widget.item!.imageUrl!,
                              width: 60,
                              height: 60,
                              fit: BoxFit.cover,
                              placeholder: (context, url) => Container(
                                width: 60,
                                height: 60,
                                color: AppTheme.placeholderColor,
                                child: const Center(
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppTheme.primaryColor,
                                  ),
                                ),
                              ),
                              errorWidget: (context, url, error) => Container(
                                width: 60,
                                height: 60,
                                color: AppTheme.placeholderColor,
                                child: Icon(
                                  Icons.image_not_supported,
                                  color: AppTheme.textSecondary,
                                  size: 24,
                                ),
                              ),
                            )
                          : widget.itemData != null
                              ? Image.asset(
                                  widget.itemData!.asset,
                                  width: 60,
                                  height: 60,
                                  fit: BoxFit.cover,
                                )
                              : Container(
                                  width: 60,
                                  height: 60,
                                  color: AppTheme.placeholderColor,
                                  child: Icon(
                                    Icons.image_not_supported,
                                    color: AppTheme.textSecondary,
                                    size: 24,
                                  ),
                                ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.item?.title ?? widget.itemData?.title ?? '',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Text(
                                widget.item != null
                                    ? widget.item!.energyPointsPrice.toString().replaceAllMapped(
                                        RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
                                        (Match m) => '${m[1]},',
                                      )
                                    : widget.itemData?.price ?? '',
                                style: GoogleFonts.inter(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.primaryColor,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Image.asset(
                                'assets/icons/ic_energy.png',
                                width: 16,
                                height: 16,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Name Field
              Text(
                'Name',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _nameController,
                style: GoogleFonts.inter(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Enter your full name',
                  hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                  filled: true,
                  fillColor: AppTheme.placeholderColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Please enter your name';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 20),

              // Phone Number Field
              Text(
                'Phone Number',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                style: GoogleFonts.inter(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Enter your phone number',
                  hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                  filled: true,
                  fillColor: AppTheme.placeholderColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Please enter your phone number';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 20),

              // Email Address Field
              Text(
                'Email Address',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                style: GoogleFonts.inter(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Enter your email address',
                  hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                  filled: true,
                  fillColor: AppTheme.placeholderColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Please enter your email address';
                  }
                  if (!value.contains('@')) {
                    return 'Please enter a valid email address';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 20),

              // Delivery Address Field
              Text(
                'Delivery Address',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _addressController,
                maxLines: 3,
                style: GoogleFonts.inter(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Enter your delivery address',
                  hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                  filled: true,
                  fillColor: AppTheme.placeholderColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.all(16),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Please enter your delivery address';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 20),

              // Comment Box
              Text(
                'Comments',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _commentController,
                maxLines: 4,
                style: GoogleFonts.inter(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Input details about the items, size, color, etc.',
                  hintStyle: GoogleFonts.inter(
                    color: AppTheme.textSecondary,
                    fontSize: 12,
                  ),
                  filled: true,
                  fillColor: AppTheme.placeholderColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.all(16),
                ),
              ),
              const SizedBox(height: 32),

              // Checkout Button (Dark Gray)
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _handleCheckout,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.grey[800], // Dark Gray
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    disabledBackgroundColor: Colors.grey[700],
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : Text(
                          'Checkout',
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}


