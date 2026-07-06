import 'package:supabase_flutter/supabase_flutter.dart';

import '../../services/supabase_service.dart';
import 'minipay_checkout_config.dart';
import 'minipay_checkout_models.dart';

class MinipayCheckoutService {
  MinipayCheckoutService({SupabaseClient? client})
      : _client = client ?? SupabaseService().client;

  final SupabaseClient _client;

  static const String sessionStatusDeployHint =
      'supabase functions deploy minipay-checkout-session-status';

  Future<MinipayCheckoutSession> createSession({
    required String marketplaceItemId,
    required String customerName,
    required String phoneNumber,
    required String email,
    required String deliveryAddress,
    String? comments,
  }) async {
    final res = await _client.functions.invoke(
      MinipayCheckoutConfig.createSessionFunctionName,
      body: {
        'marketplace_item_id': marketplaceItemId,
        'customer_name': customerName,
        'phone_number': phoneNumber,
        'email': email,
        'delivery_address': deliveryAddress,
        if (comments != null && comments.trim().isNotEmpty)
          'comments': comments.trim(),
      },
    );

    final data = res.data;
    if (res.status != 200 || data is! Map) {
      final err = data is Map ? data['error']?.toString() : null;
      throw Exception(err ?? 'Failed to create MiniPay checkout session');
    }

    if (data['success'] != true) {
      throw Exception(data['error']?.toString() ?? 'Checkout session rejected');
    }

    return MinipayCheckoutSession.fromJson(Map<String, dynamic>.from(data));
  }

  Future<MinipayCheckoutStatus> checkStatus({
    required String sessionId,
    required String sessionToken,
  }) async {
    try {
      final res = await _client.functions.invoke(
        MinipayCheckoutConfig.sessionStatusFunctionName,
        body: {
          'session_id': sessionId,
          'session_token': sessionToken,
        },
      );

      final data = res.data;
      if (data is! Map) {
        throw Exception('Invalid payment status response');
      }

      return MinipayCheckoutStatus.fromJson(Map<String, dynamic>.from(data));
    } on FunctionException catch (e) {
      if (e.status == 404) {
        throw Exception(
          'Payment status service is not deployed. Run: $sessionStatusDeployHint',
        );
      }

      final parsed = _statusFromFunctionExceptionDetails(e.details);
      if (parsed != null) return parsed;

      throw Exception(
        'Could not check payment status (HTTP ${e.status}). '
        'If this persists, deploy: $sessionStatusDeployHint',
      );
    }
  }

  MinipayCheckoutStatus? _statusFromFunctionExceptionDetails(dynamic details) {
    if (details is Map<String, dynamic>) {
      return MinipayCheckoutStatus.fromJson(details);
    }
    if (details is Map) {
      return MinipayCheckoutStatus.fromJson(Map<String, dynamic>.from(details));
    }
    return null;
  }
}
