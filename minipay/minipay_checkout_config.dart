import '../../config/app_config.dart';

/// Public MiniPay marketplace checkout configuration (no secrets).
class MinipayCheckoutConfig {
  const MinipayCheckoutConfig._();

  static String get supabaseFunctionsBaseUrl =>
      '${AppConfig.supabaseUrl}/functions/v1';

  static String get createSessionFunctionName =>
      'minipay-checkout-create-session';

  static String get verifySessionFunctionName =>
      'minipay-checkout-verify-payment';

  static String get sessionStatusFunctionName =>
      'minipay-checkout-session-status';

  static bool get isFeatureVisible => AppConfig.enableCeloCheckout;

  static bool get isProductionCheckoutEnabled =>
      AppConfig.enableMiniPayProductionCheckout;
}
