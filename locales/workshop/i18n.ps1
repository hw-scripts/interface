param(
    [ValidateSet('Merge', 'Split', 'Validate', 'Add')]
    [string]$Action = 'Validate',
    [string]$Key,
    [string]$English,
    [string]$Ukrainian,
    [string]$Russian
)

$ErrorActionPreference = 'Stop'
$languages = @('en', 'uk', 'ru')
$directory = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $PSScriptRoot 'translations.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-JsonMap([string]$path) {
    $map = [ordered]@{}
    $json = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $json -or $json -isnot [pscustomobject]) {
        throw "Expected a JSON object in: $path"
    }
    foreach ($property in $json.PSObject.Properties) {
        $map[$property.Name] = $property.Value
    }
    return $map
}

function Write-Json([string]$path, $value) {
    $json = $value | ConvertTo-Json -Depth 4
    $json = $json.Replace('\u0027', "'")
    [System.IO.File]::WriteAllText($path, "$json`r`n", $utf8)
}

function Get-FlatDictionary($translations, [string]$language) {
    $dictionary = [ordered]@{}
    foreach ($translationKey in $translations.Keys) {
        $value = $translations[$translationKey].$language
        if ($value -isnot [string] -or [string]::IsNullOrWhiteSpace($value)) {
            throw "Missing $language translation for key: $translationKey"
        }
        $dictionary[$translationKey] = $value
    }
    return $dictionary
}

function Test-SameDictionary($expected, $actual, [string]$language) {
    $expectedKeys = @($expected.Keys)
    $actualKeys = @($actual.Keys)
    if ($expectedKeys.Count -ne $actualKeys.Count) {
        throw "$language.json key count does not match translations.json"
    }
    foreach ($translationKey in $expectedKeys) {
        if (-not $actual.Contains($translationKey) -or $actual[$translationKey] -cne $expected[$translationKey]) {
            throw "$language.json is not generated from translations.json at key: $translationKey"
        }
    }
}

if ($Action -eq 'Merge') {
    $dictionaries = @{}
    foreach ($language in $languages) {
        $dictionaries[$language] = Read-JsonMap (Join-Path $directory "$language.json")
    }

    $referenceKeys = @($dictionaries.en.Keys)
    foreach ($language in $languages | Where-Object { $_ -ne 'en' }) {
        $missing = @($referenceKeys | Where-Object { -not $dictionaries[$language].Contains($_) })
        $extra = @($dictionaries[$language].Keys | Where-Object { $_ -notin $referenceKeys })
        if ($missing.Count -or $extra.Count) {
            throw "$language.json does not match en.json. Missing: $($missing -join ', '); extra: $($extra -join ', ')"
        }
    }

    $translations = [ordered]@{}
    foreach ($translationKey in $referenceKeys) {
        $translation = [ordered]@{}
        foreach ($language in $languages) {
            $translation[$language] = $dictionaries[$language][$translationKey]
        }
        $translations[$translationKey] = $translation
    }

    foreach ($language in $languages) {
        $null = Get-FlatDictionary $translations $language
    }
    Write-Json $sourcePath $translations
    Write-Host "Merged $($translations.Count) keys into $sourcePath"
    exit
}

$translations = Read-JsonMap $sourcePath

if ($Action -eq 'Add') {
    if ([string]::IsNullOrWhiteSpace($Key) -or [string]::IsNullOrWhiteSpace($English) -or [string]::IsNullOrWhiteSpace($Ukrainian) -or [string]::IsNullOrWhiteSpace($Russian)) {
        throw 'Add requires -Key, -English, -Ukrainian, and -Russian'
    }
    if ($translations.Contains($Key)) {
        throw "Translation key already exists: $Key"
    }
    $translations[$Key] = [ordered]@{
        en = $English
        uk = $Ukrainian
        ru = $Russian
    }
}

$generated = @{}
foreach ($language in $languages) {
    $generated[$language] = Get-FlatDictionary $translations $language
}

if ($Action -eq 'Add') {
    Write-Json $sourcePath $translations
}

foreach ($language in $languages) {
    $dictionary = $generated[$language]
    if ($Action -eq 'Validate') {
        Test-SameDictionary $dictionary (Read-JsonMap (Join-Path $directory "$language.json")) $language
    } else {
        Write-Json (Join-Path $directory "$language.json") $dictionary
    }
}

if ($Action -eq 'Validate') {
    Write-Host "Validated $($translations.Count) keys in $($languages -join ', ')"
} else {
    Write-Host "Split $($translations.Count) keys into $($languages -join ', ')"
}
