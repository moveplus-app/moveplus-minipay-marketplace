class MinipayCheckoutSession {
  final String sessionId;
  final String sessionToken;
  final String checkoutUrl;
  final DateTime expiresAt;
  final int chainId;
  final String chainName;
  final String tokenSymbol;
  final String tokenAddress;
  final int tokenDecimals;
  final String amountDisplay;
  final String amountRaw;
  final String treasuryAddress;
  final String itemTitle;

  const MinipayCheckoutSession({
    required this.sessionId,
    required this.sessionToken,
    required this.checkoutUrl,
    required this.expiresAt,
    required this.chainId,
    required this.chainName,
    required this.tokenSymbol,
    required this.tokenAddress,
    required this.tokenDecimals,
    required this.amountDisplay,
    required this.amountRaw,
    required this.treasuryAddress,
    required this.itemTitle,
  });

  factory MinipayCheckoutSession.fromJson(Map<String, dynamic> json) {
    return MinipayCheckoutSession(
      sessionId: '${json['session_id'] ?? ''}',
      sessionToken: '${json['session_token'] ?? ''}',
      checkoutUrl: '${json['checkout_url'] ?? ''}',
      expiresAt: DateTime.tryParse('${json['expires_at'] ?? ''}') ??
          DateTime.now().add(const Duration(minutes: 15)),
      chainId: (json['chain_id'] as num?)?.toInt() ?? 0,
      chainName: '${json['chain_name'] ?? 'Celo'}',
      tokenSymbol: '${json['token_symbol'] ?? ''}',
      tokenAddress: '${json['token_address'] ?? ''}',
      tokenDecimals: (json['token_decimals'] as num?)?.toInt() ?? 18,
      amountDisplay: '${json['amount_display'] ?? ''}',
      amountRaw: '${json['amount_raw'] ?? ''}',
      treasuryAddress: '${json['treasury_address'] ?? ''}',
      itemTitle: '${json['item_title'] ?? 'Item'}',
    );
  }
}

class MinipayCheckoutStatus {
  final bool success;
  final String status;
  final String? error;
  final String? paymentMethod;
  final String? chain;
  final String? tokenSymbol;
  final String? amountDisplay;
  final String? itemTitle;
  final String? txHash;
  final String? purchaseId;
  final String? explorerUrl;
  final bool isPaidFlag;

  const MinipayCheckoutStatus({
    required this.success,
    required this.status,
    this.error,
    this.paymentMethod,
    this.chain,
    this.tokenSymbol,
    this.amountDisplay,
    this.itemTitle,
    this.txHash,
    this.purchaseId,
    this.explorerUrl,
    this.isPaidFlag = false,
  });

  bool get isPaid => status == 'paid' || isPaidFlag;

  bool get isExpired => status == 'expired';

  bool get isFailed => status == 'failed';

  bool get isCancelled => status == 'cancelled';

  bool get isPending =>
      !isPaid && !isExpired && !isFailed && !isCancelled;

  String get userMessage {
    if (isPaid) return 'Payment verified. Your order is pending fulfillment.';
    if (isExpired) {
      return 'Checkout session expired. Please create a new MiniPay checkout.';
    }
    if (isCancelled) {
      return 'Checkout was cancelled. Please create a new MiniPay checkout.';
    }
    if (isFailed) {
      return 'Payment failed on-chain. Please create a new MiniPay checkout.';
    }
    if (error != null && error!.isNotEmpty) return error!;
    return 'Payment is still pending. Complete payment in MiniPay first.';
  }

  factory MinipayCheckoutStatus.fromJson(Map<String, dynamic> json) {
    final status = '${json['status'] ?? ''}';
    return MinipayCheckoutStatus(
      success: json['success'] == true,
      status: status,
      error: json['error']?.toString(),
      paymentMethod: json['payment_method']?.toString(),
      chain: json['chain']?.toString(),
      tokenSymbol: json['token_symbol']?.toString(),
      amountDisplay: json['amount_display']?.toString(),
      itemTitle: json['item_title']?.toString(),
      txHash: json['tx_hash']?.toString(),
      purchaseId: json['purchase_id']?.toString(),
      explorerUrl: json['explorer_url']?.toString(),
      isPaidFlag: json['is_paid'] == true || status == 'paid',
    );
  }
}
