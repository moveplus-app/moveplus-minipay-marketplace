import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'widgets/marketplace_product_form_sections.dart';

class EditProductDialog extends StatefulWidget {
  final MarketplaceItemModel product;
  final VoidCallback? onProductUpdated;

  const EditProductDialog({
    super.key,
    required this.product,
    this.onProductUpdated,
  });

  @override
  State<EditProductDialog> createState() => _EditProductDialogState();
}

class _EditProductDialogState extends State<EditProductDialog> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _energyPointsController = TextEditingController();
  final _cryptoPriceController = TextEditingController();
  final _discountController = TextEditingController();
  final _stockQuantityController = TextEditingController();
  
  String _selectedCategory = MarketplaceCategories.getDefaultCategory();
  String _selectedCryptoCurrency = MarketplaceAdminForm.defaultCryptoCurrency;
  MarketplaceStockMode _stockMode = MarketplaceStockMode.untracked;
  bool _isAvailable = true;
  File? _selectedImage;
  String? _currentImageUrl;
  bool _isSubmitting = false;
  final ImagePicker _imagePicker = ImagePicker();

  @override
  void initState() {
    super.initState();
    // Pre-fill form with existing product data
    _titleController.text = widget.product.title;
    _descriptionController.text = widget.product.description ?? '';
    _selectedCategory = widget.product.category ?? MarketplaceCategories.getDefaultCategory();
    // If category is not in the list, use default
    if (!MarketplaceCategories.categories.contains(_selectedCategory)) {
      _selectedCategory = MarketplaceCategories.getDefaultCategory();
    }
    _energyPointsController.text = widget.product.energyPointsPrice.toString();
    _cryptoPriceController.text = widget.product.cryptoPrice != null &&
            widget.product.cryptoPrice! > 0
        ? widget.product.cryptoPrice.toString()
        : '';
    _selectedCryptoCurrency = (widget.product.cryptoCurrency ?? '').trim().isEmpty
        ? MarketplaceAdminForm.defaultCryptoCurrency
        : widget.product.cryptoCurrency!.trim();
    _stockMode = MarketplaceAdminForm.stockModeFromQuantity(widget.product.stockQuantity);
    _stockQuantityController.text = widget.product.stockQuantity?.toString() ?? '';
    _isAvailable = widget.product.isAvailable;
    _currentImageUrl = widget.product.imageUrl;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _energyPointsController.dispose();
    _cryptoPriceController.dispose();
    _discountController.dispose();
    _stockQuantityController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      
      if (image != null) {
        setState(() {
          _selectedImage = File(image.path);
          _currentImageUrl = null; // Clear old URL when new image is selected
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error picking image: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _updateProduct() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      final supabaseService = SupabaseService();
      
      // Ensure Supabase is initialized
      if (!supabaseService.isInitialized) {
        try {
          await supabaseService.initialize();
        } catch (e) {
          throw Exception('Failed to initialize Supabase: $e');
        }
      }

      String? imageUrl = _currentImageUrl;

      // Upload new image if one was selected
      if (_selectedImage != null) {
        final imageBytes = await _selectedImage!.readAsBytes();
        final imagePath = 'products/${DateTime.now().millisecondsSinceEpoch}_${_selectedImage!.path.split('/').last}';
        
        try {
          imageUrl = await supabaseService.uploadImage(
            bucket: 'marketplace_images',
            path: imagePath,
            fileBytes: imageBytes,
            contentType: 'image/jpeg',
          );
        } catch (e) {
          if (e.toString().contains('Bucket not found') || e.toString().contains('404')) {
            try {
              imageUrl = await supabaseService.uploadImage(
                bucket: 'post_images',
                path: imagePath,
                fileBytes: imageBytes,
                contentType: 'image/jpeg',
              );
            } catch (e2) {
              throw Exception('Failed to upload image. Please create the "marketplace_images" bucket in Supabase Storage. Error: $e');
            }
          } else {
            rethrow;
          }
        }

        if (imageUrl == null) {
          throw Exception('Failed to upload image: No URL returned');
        }
      }

      // Calculate discount percentage (if provided)
      final discountPercent = _discountController.text.isEmpty 
          ? 0.0 
          : double.tryParse(_discountController.text) ?? 0.0;

      final cryptoPriceText = _cryptoPriceController.text.trim();
      final cryptoPrice =
          cryptoPriceText.isEmpty ? null : double.parse(cryptoPriceText);
      final stockQuantity = MarketplaceAdminForm.resolveStockQuantity(
        _stockMode,
        _stockQuantityController.text,
      );

      // Update marketplace item
      await supabaseService.updateMarketplaceItem(
        itemId: widget.product.id,
        title: _titleController.text.trim(),
        description: _descriptionController.text.trim(),
        imageUrl: imageUrl,
        energyPointsPrice: int.parse(_energyPointsController.text.trim()),
        isAvailable: _isAvailable,
        category: _selectedCategory,
        stockQuantity: stockQuantity,
        updateStockQuantity: true,
        cryptoPrice: cryptoPrice,
        cryptoCurrency: _selectedCryptoCurrency,
        updateCryptoFields: true,
      );

      if (mounted) {
        Navigator.of(context).pop();
        widget.onProductUpdated?.call();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Product "${_titleController.text}" updated successfully!'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = e.toString();
        if (errorMessage.contains('Bucket not found')) {
          errorMessage = 'Storage bucket "marketplace_images" not found. Please create it in Supabase Storage dashboard.';
        } else if (errorMessage.contains('StorageException')) {
          errorMessage = 'Storage error: Please check if the "marketplace_images" bucket exists in Supabase.';
        } else if (errorMessage.length > 100) {
          errorMessage = errorMessage.substring(0, 100) + '...';
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Error updating product: $errorMessage',
              style: const TextStyle(fontSize: 12),
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'Dismiss',
              textColor: Colors.white,
              onPressed: () {},
            ),
          ),
        );
        
        debugPrint('Error updating product: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.backgroundColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Container(
        width: 600,
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Edit Product',
                      style: GoogleFonts.inter(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Title Field
                Text(
                  'Title',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _titleController,
                  style: GoogleFonts.inter(color: AppTheme.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Enter product title',
                    hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                    filled: true,
                    fillColor: AppTheme.placeholderColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter a title';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Description Field
                Text(
                  'Description',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _descriptionController,
                  maxLines: 3,
                  style: GoogleFonts.inter(color: AppTheme.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Enter product description',
                    hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                    filled: true,
                    fillColor: AppTheme.placeholderColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.all(16),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter a description';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Category Dropdown
                Text(
                  'Category',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: AppTheme.placeholderColor,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonFormField<String>(
                    value: _selectedCategory,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: AppTheme.placeholderColor,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                    dropdownColor: AppTheme.placeholderColor,
                    style: GoogleFonts.inter(color: AppTheme.textPrimary),
                    items: MarketplaceCategories.categories.map((category) {
                      return DropdownMenuItem<String>(
                        value: category,
                        child: Text(
                          category,
                          style: GoogleFonts.inter(color: AppTheme.textPrimary),
                        ),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setState(() {
                          _selectedCategory = value;
                        });
                      }
                    },
                  ),
                ),
                const SizedBox(height: 16),

                MarketplaceProductFormSections.inStockCheckbox(
                  value: _isAvailable,
                  onChanged: (value) => setState(() => _isAvailable = value),
                ),
                const SizedBox(height: 16),

                MarketplaceProductFormSections.stockModeSection(
                  mode: _stockMode,
                  onModeChanged: (mode) => setState(() => _stockMode = mode),
                  quantityController: _stockQuantityController,
                ),
                const SizedBox(height: 16),

                // Discount % Field
                Text(
                  'Discount %',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _discountController,
                  keyboardType: TextInputType.number,
                  style: GoogleFonts.inter(color: AppTheme.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Enter discount percentage (0-100)',
                    hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                    filled: true,
                    fillColor: AppTheme.placeholderColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    suffixText: '%',
                    suffixStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                  ),
                  validator: (value) {
                    if (value != null && value.isNotEmpty) {
                      final discount = double.tryParse(value);
                      if (discount == null || discount < 0 || discount > 100) {
                        return 'Please enter a valid discount (0-100)';
                      }
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Image Picker
                Text(
                  'Image',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: _pickImage,
                  child: Container(
                    width: double.infinity,
                    height: 200,
                    decoration: BoxDecoration(
                      color: AppTheme.placeholderColor,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: Colors.white10,
                        width: 1,
                      ),
                    ),
                    child: _selectedImage != null
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.file(
                              _selectedImage!,
                              fit: BoxFit.cover,
                            ),
                          )
                        : _currentImageUrl != null && _currentImageUrl!.isNotEmpty
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: CachedNetworkImage(
                                  imageUrl: _currentImageUrl!,
                                  fit: BoxFit.cover,
                                  placeholder: (context, url) => Container(
                                    color: AppTheme.placeholderColor,
                                    child: const Center(
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    ),
                                  ),
                                  errorWidget: (context, url, error) => Icon(
                                    Icons.image,
                                    color: AppTheme.textSecondary,
                                    size: 48,
                                  ),
                                ),
                              )
                            : Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.add_photo_alternate_outlined,
                                    color: AppTheme.textSecondary,
                                    size: 48,
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Tap to select image',
                                    style: GoogleFonts.inter(
                                      fontSize: 14,
                                      color: AppTheme.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                  ),
                ),
                const SizedBox(height: 16),

                // Energy Points Field
                Text(
                  'Energy Points',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _energyPointsController,
                  keyboardType: TextInputType.number,
                  style: GoogleFonts.inter(color: AppTheme.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Enter energy points price',
                    hintStyle: GoogleFonts.inter(color: AppTheme.textSecondary),
                    filled: true,
                    fillColor: AppTheme.placeholderColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    suffixIcon: Padding(
                      padding: const EdgeInsets.only(right: 12.0),
                      child: Image.asset(
                        'assets/icons/ic_energy.png',
                        width: 20,
                        height: 20,
                      ),
                    ),
                    suffixIconConstraints: const BoxConstraints(
                      minWidth: 20,
                      minHeight: 20,
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter energy points';
                    }
                    final points = int.tryParse(value.trim());
                    if (points == null || points <= 0) {
                      return 'Please enter a valid number';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                MarketplaceProductFormSections.cryptoPriceField(
                  controller: _cryptoPriceController,
                  isAvailable: _isAvailable,
                ),
                const SizedBox(height: 16),

                MarketplaceProductFormSections.cryptoCurrencyField(
                  value: _selectedCryptoCurrency,
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => _selectedCryptoCurrency = value);
                    }
                  },
                ),
                const SizedBox(height: 24),

                // Update Button
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _isSubmitting ? null : _updateProduct,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      disabledBackgroundColor: Colors.grey[700],
                    ),
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.black),
                            ),
                          )
                        : Text(
                            'Update',
                            style: GoogleFonts.inter(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

