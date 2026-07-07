

// Keep MarketplaceTileData for backward compatibility with home screen
class MarketplaceTileData {
  const MarketplaceTileData({
    required this.title,
    required this.price,
    required this.asset,
  });

  final String title;
  final String price;
  final String asset;
}

class MarketplaceItemDialog extends StatelessWidget {
  const MarketplaceItemDialog({
    super.key,
    this.data,
    this.item,
  });

  final MarketplaceTileData? data;
  final MarketplaceItemModel? item;

  String _formatPrice(int price) {
    return price.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
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
                maxHeight: 500,
                minHeight: 438,
              ),
              decoration: BoxDecoration(
                color: AppTheme.placeholderColor,
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.4),
                    blurRadius: 20,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Scrollable content area
                  Flexible(
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // Image section (fixed size)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(20),
                            child: SizedBox(
                              width: 303,
                              height: 287,
                              child: item != null && item!.imageUrl != null && item!.imageUrl!.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: item!.imageUrl!,
                                      fit: BoxFit.cover,
                                      placeholder: (context, url) => Container(
                                        color: AppTheme.placeholderColor,
                                        child: const Center(
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: AppTheme.primaryColor,
                                          ),
                                        ),
                                      ),
                                      errorWidget: (context, url, error) => Container(
                                        color: AppTheme.placeholderColor,
                                        child: Icon(
                                          Icons.image_not_supported,
                                          color: AppTheme.textSecondary,
                                          size: 64,
                                        ),
                                      ),
                                    )
                                  : data != null
                                      ? Image.asset(
                                          data!.asset,
                                          fit: BoxFit.cover,
                                        )
                                      : Container(
                                          color: AppTheme.placeholderColor,
                                          child: Icon(
                                            Icons.image_not_supported,
                                            color: AppTheme.textSecondary,
                                            size: 64,
                                          ),
                                        ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          // Title (fixed)
                          Text(
                            item?.title ?? data?.title ?? '',
                            style: GoogleFonts.inter(
                              fontSize: 15,
                              color: Colors.white,
                              height: 1,
                              fontWeight: FontWeight.w600,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 4),
                          // Price (fixed)
                          Text(
                            item != null
                                ? _formatPrice(item!.energyPointsPrice)
                                : data?.price ?? '',
                            style: GoogleFonts.inter(
                              fontSize: 32,
                              color: AppTheme.primaryColor,
                              height: 0.9,
                            ),
                          ),
                          const SizedBox(height: 4),
                          // Energy Points label (fixed)
                          Text(
                            'Energy Points',
                            style: GoogleFonts.inter(
                              fontSize: 8,
                              color: AppTheme.textSecondary,
                              height: 1,
                            ),
                          ),
                          // Description (scrollable, constrained height)
                          if (item?.description != null && item!.description!.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Container(
                              constraints: const BoxConstraints(
                                maxHeight: 80,
                                minHeight: 40,
                              ),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: AppTheme.backgroundColor,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: SingleChildScrollView(
                                child: Text(
                                  item!.description!,
                                  style: GoogleFonts.inter(
                                    fontSize: 12,
                                    color: AppTheme.textSecondary,
                                    height: 1.4,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  // Button (always visible at bottom)
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 44,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryColor,
                        foregroundColor: const Color(0xFF1B1B1B),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop(); // Close dialog
                        if (item != null) {
                          context.push(
                            '/marketplace/checkout',
                            extra: item,
                          );
                        } else if (data != null) {
                          context.push(
                            '/marketplace/checkout',
                            extra: data,
                          );
                        }
                      },
                      child: Text(
                        'CLAIM',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
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
