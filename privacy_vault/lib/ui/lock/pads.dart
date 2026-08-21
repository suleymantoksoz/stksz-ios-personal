import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Büyük yuvarlak tuş tabanlı ortak tuş takımı bileşeni.
class _PadButton extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  const _PadButton({required this.child, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(6),
      child: Material(
        color: AppColors.surface2,
        shape: const CircleBorder(side: BorderSide(color: AppColors.border)),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(width: 68, height: 68, child: Center(child: child)),
        ),
      ),
    );
  }
}

/// PIN girişi: 0-9 + geri silme. maxLength dolunca otomatik submit eder.
class PinPad extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  final VoidCallback onSubmit;
  final int length;
  const PinPad({super.key, required this.value, required this.onChanged, required this.onSubmit, this.length = 6});

  void _tap(String d) {
    if (value.length >= length) return;
    final next = value + d;
    onChanged(next);
    if (next.length == length) onSubmit();
  }

  @override
  Widget build(BuildContext context) {
    Widget key(String label) => _PadButton(
          onTap: () => _tap(label),
          child: Text(label, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600, color: AppColors.text)),
        );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [key('1'), key('2'), key('3')]),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [key('4'), key('5'), key('6')]),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [key('7'), key('8'), key('9')]),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const SizedBox(width: 80),
          key('0'),
          _PadButton(
            onTap: value.isEmpty ? null : () => onChanged(value.substring(0, value.length - 1)),
            child: const Icon(Icons.backspace_outlined, color: AppColors.textDim),
          ),
        ]),
      ],
    );
  }
}

/// PIN nokta göstergesi.
class PinDots extends StatelessWidget {
  final int filled;
  final int total;
  final Color? color;
  const PinDots({super.key, required this.filled, this.total = 6, this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(
        total,
        (i) => AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          margin: const EdgeInsets.symmetric(horizontal: 7),
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: i < filled ? (color ?? Theme.of(context).colorScheme.primary) : Colors.transparent,
            border: Border.all(color: i < filled ? Colors.transparent : AppColors.textDim, width: 1.5),
          ),
        ),
      ),
    );
  }
}

/// Desen (pattern) girişi: 3x3 düğüm, sırayla dokun, tekrar dokunulamaz.
class PatternPad extends StatelessWidget {
  final List<int> value;
  final ValueChanged<List<int>> onChanged;
  const PatternPad({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var row = 0; row < 3; row++)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var col = 0; col < 3; col++)
                Builder(builder: (context) {
                  final idx = row * 3 + col;
                  final order = value.indexOf(idx);
                  final selected = order >= 0;
                  return Padding(
                    padding: const EdgeInsets.all(10),
                    child: GestureDetector(
                      onTap: selected ? null : () => onChanged([...value, idx]),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 120),
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: selected ? accent.withValues(alpha: 0.18) : AppColors.surface2,
                          border: Border.all(color: selected ? accent : AppColors.border, width: 1.6),
                        ),
                        child: Center(
                          child: selected
                              ? Text('${order + 1}',
                                  style: TextStyle(color: accent, fontWeight: FontWeight.w800, fontSize: 20))
                              : Container(
                                  width: 10, height: 10, decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.textDim)),
                        ),
                      ),
                    ),
                  );
                }),
            ],
          ),
        TextButton.icon(
          onPressed: value.isEmpty ? null : () => onChanged(const []),
          icon: const Icon(Icons.refresh, size: 18),
          label: const Text('Sıfırla'),
        ),
      ],
    );
  }
}

/// Acil kurtarma sembolü girişi — kullanıcının belirlediği sembol dizisi.
/// Şifre/gizli giriş ifadeleri İÇERMEZ (spec md.12).
class SymbolPad extends StatelessWidget {
  final List<String> value;
  final ValueChanged<List<String>> onChanged;
  const SymbolPad({super.key, required this.value, required this.onChanged});

  static const symbols = ['★', '✦', '◆', '●', '■', '▲', '✚', '!', '#', '*', '.', '◐'];

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          height: 46,
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(12)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: value.isEmpty
                ? [const Text('—', style: TextStyle(color: AppColors.textDim, fontSize: 18))]
                : value.map((s) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text(s, style: TextStyle(color: accent, fontSize: 20, fontWeight: FontWeight.w700)),
                    )).toList(),
          ),
        ),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final s in symbols)
              SizedBox(
                width: 58,
                height: 58,
                child: Material(
                  color: AppColors.surface2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AppColors.border)),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => onChanged([...value, s]),
                    child: Center(child: Text(s, style: const TextStyle(fontSize: 22, color: AppColors.text))),
                  ),
                ),
              ),
            SizedBox(
              width: 58,
              height: 58,
              child: Material(
                color: Colors.transparent,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AppColors.border)),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: value.isEmpty ? null : () => onChanged(value.sublist(0, value.length - 1)),
                  child: const Center(child: Icon(Icons.backspace_outlined, color: AppColors.textDim)),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
