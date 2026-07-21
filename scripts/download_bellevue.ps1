<#
.SYNOPSIS
    Downloads the Bellevue Collection shop/dining directory and saves it as Excel.

.DESCRIPTION
    Bellevue Collection's directory API returns everything in one response
    (no pagination) - see docs/bellevue-collection-anatomy.md for how this
    was discovered:
        https://bellevuecollection.com/wp-json/tbc/shopping-directory/retail
        https://bellevuecollection.com/wp-json/tbc/shopping-directory/dining
        https://bellevuecollection.com/wp-json/tbc/shopping-directory/hotels

.PARAMETER OutputPath
    Path to the .xlsx file to create. Defaults to bellevue_directory.xlsx in
    the current folder.

.EXAMPLE
    .\download_bellevue.ps1
    .\download_bellevue.ps1 -OutputPath "C:\Users\me\Desktop\bellevue.xlsx"
#>

param(
    [string]$OutputPath = "bellevue_directory.xlsx"
)

$ErrorActionPreference = "Stop"

# Export-Excel (from the ImportExcel module) writes real .xlsx files with no
# Excel installation required. Install it once if it's missing.
if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
    Write-Host "Installing the ImportExcel module (one-time)..."
    Install-Module -Name ImportExcel -Scope CurrentUser -Force -AllowClobber
}
Import-Module ImportExcel

$BaseUrl = "https://bellevuecollection.com/wp-json/tbc/shopping-directory"
$SiteBaseUrl = "https://bellevuecollection.com"

# One row per directory: (ApiPath, Sheet name)
$Directories = @(
    @{ ApiPath = "retail"; Sheet = "Retail" }
    @{ ApiPath = "dining"; Sheet = "Dining" }
    @{ ApiPath = "hotels"; Sheet = "Hotels" }
)

function ConvertTo-NormalizedRow {
    param($Item)

    $imageUrl = $Item.image
    if ($imageUrl -and $imageUrl -notmatch '^https?://') {
        $imageUrl = "$SiteBaseUrl$imageUrl"
    }

    [PSCustomObject]@{
        name        = $Item.title
        description = $Item.tmp_message
        url         = $Item.link
        source_id   = $Item.slug
        logo        = $imageUrl
        image       = $imageUrl
        floor       = ($Item.property_names -join ", ")
        category    = ($Item.category_names -join ", ")
    }
}

# Remove any previous file so Export-Excel doesn't append to stale sheets.
if (Test-Path $OutputPath) {
    Remove-Item $OutputPath
}

foreach ($dir in $Directories) {
    $endpoint = "$BaseUrl/$($dir.ApiPath)"
    Write-Host "Fetching '$($dir.ApiPath)' directory from $endpoint ..."

    try {
        $items = Invoke-RestMethod -Uri $endpoint -Method Get
    } catch {
        Write-Warning "Skipping '$($dir.ApiPath)': $($_.Exception.Message)"
        continue
    }

    if (-not $items -or $items.Count -eq 0) {
        Write-Warning "No entries returned for '$($dir.ApiPath)'."
        continue
    }

    $rows = $items | ForEach-Object { ConvertTo-NormalizedRow $_ }
    Write-Host "Fetched $($rows.Count) entries for $($dir.Sheet)."

    $rows | Export-Excel -Path $OutputPath -WorksheetName $dir.Sheet -AutoSize -BoldTopRow -FreezeTopRow
}

Write-Host "Saved to $OutputPath"
