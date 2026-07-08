/// Admin marketplace product form helpers (Real Items / web checkout).
enum MarketplaceStockMode {
  untracked,
  tracked,
}

class MarketplaceAdminForm {
  static const String defaultCryptoCurrency = 'USDC';
  static const List<String> cryptoCurrencies = ['USDC', 'cUSD'];

  static String? validateCryptoPrice(String? value, {required bool isAvailable}) {
    if (!isAvailable) return null;
    if (value == null || value.trim().isEmpty) {
      return 'Crypto price is required for web checkout';
    }
    final price = double.tryParse(value.trim());
    if (price == null || price <= 0) {
      return 'Enter a crypto price greater than 0';
    }
    return null;
  }

  static String? validateStockQuantity(String? value, MarketplaceStockMode mode) {
    if (mode != MarketplaceStockMode.tracked) return null;
    if (value == null || value.trim().isEmpty) {
      return 'Enter stock quantity';
    }
    final stock = int.tryParse(value.trim());
    if (stock == null || stock < 0) {
      return 'Enter a valid quantity (0 = sold out)';
    }
    return null;
  }

  static int? resolveStockQuantity(MarketplaceStockMode mode, String text) {
    if (mode == MarketplaceStockMode.untracked) return null;
    return int.tryParse(text.trim()) ?? 0;
  }

  static MarketplaceStockMode stockModeFromQuantity(int? stockQuantity) {
    return stockQuantity == null
        ? MarketplaceStockMode.untracked
        : MarketplaceStockMode.tracked;
  }

  static String stockListLabel(int? stockQuantity) {
    if (stockQuantity == null) return 'Untracked';
    if (stockQuantity == 0) return 'Sold out';
    return '$stockQuantity available';
  }

  static String cryptoListLabel(double? cryptoPrice, String? cryptoCurrency) {
    if (cryptoPrice == null || cryptoPrice <= 0) return '—';
    final symbol = (cryptoCurrency ?? '').trim().isEmpty
        ? defaultCryptoCurrency
        : cryptoCurrency!.trim();
    final formatted = cryptoPrice % 1 == 0
        ? cryptoPrice.toStringAsFixed(0)
        : cryptoPrice.toStringAsFixed(2);
    return '$formatted $symbol';
  }

  static String energyListLabel(int energyPoints) => '$energyPoints EP';

  static String? validateOfferEndsAt({
    required bool isLimitedOffer,
    required DateTime? offerEndsAt,
    required bool isAvailable,
    DateTime? existingEndsAt,
  }) {
    if (!isLimitedOffer) return null;
    if (offerEndsAt == null) return 'Offer end date and time is required';

    final now = DateTime.now();
    final alreadyExpired = existingEndsAt != null && existingEndsAt.isBefore(now);
    if (isAvailable && !alreadyExpired && offerEndsAt.isBefore(now)) {
      return 'Offer end must be in the future for active products';
    }
    return null;
  }

  static String? validateSourceUrl(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final trimmed = value.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return 'Enter a valid http(s) URL';
    }
    return null;
  }
}
