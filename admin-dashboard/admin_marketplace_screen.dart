import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';




import 'add_product_dialog.dart';
import 'edit_product_dialog.dart';
import '../../utils/marketplace_admin_form.dart';

class AdminMarketplaceScreen extends StatefulWidget {
  const AdminMarketplaceScreen({
    super.key,
    this.onOrderDelivered,
  });

  final VoidCallback? onOrderDelivered;

  @override
  State<AdminMarketplaceScreen> createState() => _AdminMarketplaceScreenState();
}

class _AdminMarketplaceScreenState extends State<AdminMarketplaceScreen> {
  final SupabaseService _supabaseService = SupabaseService();
  List<MarketplaceItemModel> _products = [];
  List<PurchaseModel> _orders = [];
  bool _isLoading = true;
  bool _isLoadingOrders = false;
  String? _errorMessage;
  int _selectedTab = 0; // 0 = Products, 1 = Orders

  @override
  void initState() {
    super.initState();
    // Delay loading to ensure Supabase is initialized
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future.delayed(const Duration(milliseconds: 500), () {
        _loadProducts();
        _loadOrders();
      });
    });
  }

  Future<void> _loadOrders() async {
    if (!mounted) return;
    
    setState(() {
      _isLoadingOrders = true;
    });
    
    try {
      final orders = await _supabaseService.getAllPurchases(limit: 100);
      if (mounted) {
        setState(() {
          _orders = orders;
          _isLoadingOrders = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoadingOrders = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error loading orders: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  Future<void> _loadProducts() async {
    if (!mounted) return;
    
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    
    try {
      final products = await _supabaseService.getAdminMarketplaceItems(limit: 100);
      if (mounted) {
        setState(() {
          _products = products;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Error loading products: $e';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error loading products: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  void _showAddProductDialog() {
    showDialog(
      context: context,
      builder: (context) => AddProductDialog(
        onProductAdded: () {
          _loadProducts(); // Refresh the list
        },
      ),
    );
  }

  void _showEditProductDialog(MarketplaceItemModel product) {
    showDialog(
      context: context,
      builder: (context) => EditProductDialog(
        product: product,
        onProductUpdated: () {
          _loadProducts(); // Refresh the list
        },
      ),
    );
  }

  Future<void> _deleteProduct(MarketplaceItemModel product) async {
    // Show confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.placeholderColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        title: Text(
          'Delete Product',
          style: GoogleFonts.inter(
            color: AppTheme.textPrimary,
            fontWeight: FontWeight.w600,
            fontSize: 18,
          ),
        ),
        content: Text(
          'Are you sure you want to delete "${product.title}"? This action cannot be undone.',
          style: GoogleFonts.inter(
            color: AppTheme.textSecondary,
            fontSize: 14,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              'Delete',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await _supabaseService.deleteMarketplaceItem(product.id);
      if (mounted) {
        _loadProducts(); // Refresh the list
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Product "${product.title}" deleted successfully'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error deleting product: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  void _showOrderDetails(PurchaseModel order) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(24),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
          decoration: BoxDecoration(
            color: AppTheme.placeholderColor,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: Colors.white10, width: 1),
                  ),
                ),
                child: Row(
                  children: [
                    Text(
                      'Order Details',
                      style: GoogleFonts.inter(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              // Content
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Order Status
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: _getStatusColor(order.status).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'Status: ${_getStatusLabel(order.status)}',
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: _getStatusColor(order.status),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                    
                      // Item Information
                      Text(
                        'Item Information',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          // Item Image
                          if (order.itemImageUrl != null && order.itemImageUrl!.isNotEmpty)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: CachedNetworkImage(
                                imageUrl: order.itemImageUrl!,
                                width: 80,
                                height: 80,
                                fit: BoxFit.cover,
                                placeholder: (context, url) => Container(
                                  width: 80,
                                  height: 80,
                                  color: Colors.white10,
                                  child: const Center(
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  ),
                                ),
                                errorWidget: (context, url, error) => Container(
                                  width: 80,
                                  height: 80,
                                  decoration: BoxDecoration(
                                    color: Colors.white10,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(Icons.image, color: AppTheme.textSecondary, size: 32),
                                ),
                              ),
                            )
                          else
                            Container(
                              width: 80,
                              height: 80,
                              decoration: BoxDecoration(
                                color: Colors.white10,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(Icons.image, color: AppTheme.textSecondary, size: 32),
                            ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  order.itemTitle ?? 'Unknown Item',
                                  style: GoogleFonts.inter(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: AppTheme.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    Text(
                                      '${order.energyPointsPaid}',
                                      style: GoogleFonts.inter(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700,
                                        color: AppTheme.primaryColor,
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    Image.asset(
                                      'assets/icons/ic_energy.png',
                                      width: 20,
                                      height: 20,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Energy Points',
                                      style: GoogleFonts.inter(
                                        fontSize: 14,
                                        color: AppTheme.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      
                      // Customer Information
                      Text(
                        'Customer Information',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildDetailRow('Name', order.customerName ?? order.userName ?? 'Guest'),
                      if (order.email != null || order.userEmail != null)
                        _buildDetailRow('Email', order.email ?? order.userEmail ?? ''),
                      if (order.phoneNumber != null)
                        _buildDetailRow('Phone', order.phoneNumber!),
                      const SizedBox(height: 24),
                      
                      // Delivery Information
                      if (order.deliveryAddress != null && order.deliveryAddress!.isNotEmpty) ...[
                        Text(
                          'Delivery Address',
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white10.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            order.deliveryAddress!,
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],
                      
                      // Comments
                      if (order.comments != null && order.comments!.isNotEmpty) ...[
                        Text(
                          'Comments',
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white10.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            order.comments!,
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],
                      
                      // Order Date
                      Text(
                        'Order Information',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildDetailRow('Order Date', _formatDateTime(order.createdAt)),
                      _buildDetailRow('Order ID', order.id),
                    ],
                  ),
                ),
              ),
              // Footer
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Colors.white10, width: 1),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(
                        'Close',
                        style: GoogleFonts.inter(
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ),
                    if (order.status == PurchaseStatus.pending) ...[
                      const SizedBox(width: 12),
                      ElevatedButton(
                        onPressed: () {
                          Navigator.of(context).pop();
                          _deliverOrder(order);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: Text(
                          'Deliver',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _deliverOrder(PurchaseModel order) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.placeholderColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        title: Text(
          'Deliver Order',
          style: GoogleFonts.inter(
            color: AppTheme.textPrimary,
            fontWeight: FontWeight.w600,
            fontSize: 18,
          ),
        ),
        content: Text(
          'Mark this order as delivered? The energy points will be permanently burned out of circulation.',
          style: GoogleFonts.inter(
            color: AppTheme.textSecondary,
            fontSize: 14,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(
              'Cancel',
              style: GoogleFonts.inter(
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.black,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              'Deliver',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await _supabaseService.updatePurchaseStatus(
        purchaseId: order.id,
        status: PurchaseStatus.completed,
        burnPoints: true,
      );
      if (mounted) {
        _loadOrders();
        // Wait a bit for database to sync, then notify dashboard to refresh stats
        await Future.delayed(const Duration(milliseconds: 500));
        // Notify dashboard to refresh stats
        widget.onOrderDelivered?.call();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Order marked as delivered - Energy points deducted'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error delivering order: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with Title and Add Button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Marketplace',
                style: GoogleFonts.inter(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
                ),
              ),
              if (_selectedTab == 0)
                ElevatedButton.icon(
                  onPressed: _showAddProductDialog,
                  icon: const Icon(Icons.add, size: 18),
                  label: Text(
                    'Add Product',
                    style: GoogleFonts.inter(fontSize: 14),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.placeholderColor,
                    foregroundColor: AppTheme.textPrimary,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          // Tabs
          Row(
            children: [
              _buildTab('Products', 0),
              const SizedBox(width: 16),
              _buildTab('Orders', 1),
            ],
          ),
          // Content based on selected tab
          Expanded(
            child: _selectedTab == 0 ? _buildProductsTab() : _buildOrdersTab(),
          ),
        ],
      ),
    );
  }

  Widget _buildTab(String label, int index) {
    final isSelected = _selectedTab == index;
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedTab = index;
        });
        if (index == 1) {
          _loadOrders();
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? AppTheme.primaryColor : Colors.white24,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: isSelected ? Colors.black : AppTheme.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildProductsTab() {
    return Container(
              decoration: BoxDecoration(
                color: AppTheme.placeholderColor,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  // Table Header
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: Colors.white10, width: 1),
                      ),
                    ),
                    child: Row(
                      children: [
                        SizedBox(width: 60, child: Text('Image', style: _headerStyle())),
                        Expanded(flex: 2, child: Text('Name', style: _headerStyle())),
                        Expanded(child: Text('Energy', style: _headerStyle())),
                        Expanded(child: Text('Crypto', style: _headerStyle())),
                        Expanded(child: Text('Stock', style: _headerStyle())),
                        Expanded(child: Text('Status', style: _headerStyle())),
                        SizedBox(width: 100, child: Text('Actions', style: _headerStyle())),
                      ],
                    ),
                  ),
                  // Table Rows
                  Expanded(
                    child: _isLoading
                        ? const Center(
                            child: CircularProgressIndicator(),
                          )
                        : _errorMessage != null
                            ? Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.error_outline,
                                      color: Colors.red,
                                      size: 48,
                                    ),
                                    const SizedBox(height: 16),
                                    Text(
                                      _errorMessage!,
                                      style: GoogleFonts.inter(
                                        fontSize: 14,
                                        color: AppTheme.textSecondary,
                                      ),
                                      textAlign: TextAlign.center,
                                    ),
                                    const SizedBox(height: 16),
                                    ElevatedButton(
                                      onPressed: _loadProducts,
                                      child: Text('Retry'),
                                    ),
                                  ],
                                ),
                              )
                        : _products.isEmpty
                            ? Center(
                                child: Text(
                                  'No products found',
                                  style: GoogleFonts.inter(
                                    fontSize: 14,
                                    color: AppTheme.textSecondary,
                                  ),
                                ),
                              )
                            : ListView.builder(
                                itemCount: _products.length,
                                itemBuilder: (context, index) {
                                  return _buildProductRow(_products[index]);
                                },
                              ),
                  ),
                ],
              ),
            );
  }

  Widget _buildOrdersTab() {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.placeholderColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          // Table Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: Colors.white10, width: 1),
              ),
            ),
            child: Row(
              children: [
                SizedBox(width: 60, child: Text('Image', style: _headerStyle())),
                Expanded(flex: 2, child: Text('Customer', style: _headerStyle())),
                Expanded(flex: 2, child: Text('Item', style: _headerStyle())),
                Expanded(child: Text('Points', style: _headerStyle())),
                Expanded(child: Text('Status', style: _headerStyle())),
                Expanded(child: Text('Date', style: _headerStyle())),
                SizedBox(width: 160, child: Text('Actions', style: _headerStyle())),
              ],
            ),
          ),
          // Table Rows
          Expanded(
            child: _isLoadingOrders
                ? const Center(
                    child: CircularProgressIndicator(),
                  )
                : _orders.isEmpty
                    ? Center(
                        child: Text(
                          'No orders found',
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      )
                    : ListView.builder(
                        itemCount: _orders.length,
                        itemBuilder: (context, index) {
                          return _buildOrderRow(_orders[index]);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrderRow(PurchaseModel order) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.white10, width: 1),
        ),
      ),
      child: Row(
        children: [
          // Image
          SizedBox(
            width: 60,
            child: order.itemImageUrl != null && order.itemImageUrl!.isNotEmpty
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: CachedNetworkImage(
                      imageUrl: order.itemImageUrl!,
                      width: 50,
                      height: 50,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        width: 50,
                        height: 50,
                        color: Colors.white10,
                        child: const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        width: 50,
                        height: 50,
                        decoration: BoxDecoration(
                          color: Colors.white10,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(Icons.image, color: AppTheme.textSecondary, size: 24),
                      ),
                    ),
                  )
                : Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: Colors.white10,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(Icons.image, color: AppTheme.textSecondary, size: 24),
                  ),
          ),
          // Customer
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.customerName ?? order.userName ?? 'Guest',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                if (order.email != null || order.userEmail != null)
                  Text(
                    order.email ?? order.userEmail ?? '',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
          // Item
          Expanded(
            flex: 2,
            child: Text(
              order.itemTitle ?? 'Unknown Item',
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          // Points
          Expanded(
            child: Row(
              children: [
                Text(
                  '${order.energyPointsPaid}',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    color: AppTheme.textPrimary,
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
          ),
          // Status
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _getStatusColor(order.status).withOpacity(0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                _getStatusLabel(order.status),
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: _getStatusColor(order.status),
                ),
              ),
            ),
          ),
          // Date
          Expanded(
            child: Text(
              _formatDate(order.createdAt),
              style: GoogleFonts.inter(
                fontSize: 12,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          // Actions
          SizedBox(
            width: 160,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  icon: Icon(Icons.visibility_outlined, color: AppTheme.textSecondary, size: 20),
                  onPressed: () => _showOrderDetails(order),
                  tooltip: 'View Details',
                ),
                if (order.status == PurchaseStatus.pending)
                  ElevatedButton(
                    onPressed: () => _deliverOrder(order),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    child: Text(
                      'Deliver',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                else
                  Text(
                    'Delivered',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: Colors.green,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(PurchaseStatus status) {
    switch (status) {
      case PurchaseStatus.completed:
        return Colors.green;
      case PurchaseStatus.cancelled:
        return Colors.red;
      case PurchaseStatus.pending:
        return Colors.orange;
    }
  }

  String _getStatusLabel(PurchaseStatus status) {
    switch (status) {
      case PurchaseStatus.completed:
        return 'Completed';
      case PurchaseStatus.cancelled:
        return 'Cancelled';
      case PurchaseStatus.pending:
        return 'Pending';
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  TextStyle _headerStyle() {
    return GoogleFonts.inter(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      color: AppTheme.textSecondary,
    );
  }

  Widget _buildProductRow(MarketplaceItemModel product) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.white10, width: 1),
        ),
      ),
      child: Row(
        children: [
          // Image
          SizedBox(
            width: 60,
            child: product.imageUrl != null && product.imageUrl!.isNotEmpty
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: CachedNetworkImage(
                      imageUrl: product.imageUrl!,
                      width: 50,
                      height: 50,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        width: 50,
                        height: 50,
                        color: Colors.white10,
                        child: const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        width: 50,
                        height: 50,
                        decoration: BoxDecoration(
                          color: Colors.white10,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(Icons.image, color: AppTheme.textSecondary, size: 24),
                      ),
                    ),
                  )
                : Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: Colors.white10,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(Icons.image, color: AppTheme.textSecondary, size: 24),
                  ),
          ),
          // Name
          Expanded(
            flex: 2,
            child: Text(
              product.title,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          // Energy
          Expanded(
            child: Text(
              MarketplaceAdminForm.energyListLabel(product.energyPointsPrice),
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          // Crypto
          Expanded(
            child: Text(
              MarketplaceAdminForm.cryptoListLabel(
                product.cryptoPrice,
                product.cryptoCurrency,
              ),
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          // Stock
          Expanded(
            child: Text(
              MarketplaceAdminForm.stockListLabel(product.stockQuantity),
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          // Status
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: product.isAvailable
                    ? Colors.green.withOpacity(0.2)
                    : Colors.red.withOpacity(0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                product.isAvailable ? 'In Stock' : 'Out of Stock',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: product.isAvailable ? Colors.green : Colors.red,
                ),
              ),
            ),
          ),
          // Edit and Delete
          SizedBox(
            width: 100,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  icon: Icon(Icons.edit_outlined, color: AppTheme.textSecondary, size: 20),
                  onPressed: () => _showEditProductDialog(product),
                  tooltip: 'Edit Product',
                ),
                IconButton(
                  icon: Icon(Icons.delete_outline, color: Colors.red, size: 20),
                  onPressed: () => _deleteProduct(product),
                  tooltip: 'Delete Product',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

