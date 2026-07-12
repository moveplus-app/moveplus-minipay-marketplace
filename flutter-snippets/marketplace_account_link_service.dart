import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../config/app_config.dart';
import '../../web3/utils/sensitive_log.dart';

/// Creates a one-time web marketplace link URL for the signed-in Move+ user.
/// Does not pass Supabase JWT in the URL — only an opaque `link_token`.
class MarketplaceAccountLinkService {
  MarketplaceAccountLinkService({SupabaseClient? client})
      : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;

  /// Returns hosted marketplace URL with `?link_token=…`, or null if unavailable.
  Future<Uri?> createLinkUrl() async {
    final session = _client.auth.currentSession;
    if (session == null || session.accessToken.isEmpty) {
      return null;
    }

    try {
      final response = await _client.functions.invoke(
        'create-marketplace-link-session',
        headers: {'Authorization': 'Bearer ${session.accessToken}'},
      );

      final data = response.data;
      if (data is! Map) return null;
      if (data['success'] != true) return null;

      final linkUrl = data['link_url']?.toString().trim();
      if (linkUrl != null && linkUrl.isNotEmpty) {
        return Uri.tryParse(linkUrl);
      }

      final token = data['link_token']?.toString().trim();
      if (token == null || token.isEmpty) return null;

      final base =
          AppConfig.webRealMarketplaceBaseUrl.replaceAll(RegExp(r'/+$'), '');
      return Uri.parse(base).replace(
        queryParameters: <String, String>{'link_token': token},
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint(
          '[MarketplaceLink] create failed: ${redactThrowableForLog(e)}',
        );
      }
      return null;
    }
  }
}
