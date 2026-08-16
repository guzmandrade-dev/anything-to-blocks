<?php
/**
 * Plugin Name:       Anything to Blocks Companion
 * Plugin URI:        https://github.com/guzma/anything-to-blocks
 * Description:       Registers WordPress MCP abilities for Gutenberg block, pattern, and template introspection. Requires the WordPress MCP Adapter plugin.
 * Version:           0.1.0
 * Requires at least: 6.9
 * Requires PHP:      7.4
 * Author:            h4l9k
 * License:           GPL-2.0-or-later
 *
 * @package A2BCompanion
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'A2B_COMPANION_VERSION', '0.1.0' );
define( 'A2B_COMPANION_DIR', plugin_dir_path( __FILE__ ) );

/**
 * Register MCP abilities on plugins_loaded so the MCP Adapter is available.
 */
add_action(
    'plugins_loaded',
    function () {
        if ( ! class_exists( 'WP\MCP\Core\McpAdapter' ) ) {
            // MCP Adapter is not active — show an admin notice.
            add_action( 'admin_notices', function () {
                echo '<div class="notice notice-error"><p>';
                echo esc_html__( 'Anything to Blocks Companion requires the WordPress MCP Adapter plugin to be installed and active.', 'a2b-companion' );
                echo '</p></div>';
            } );
            return;
        }

        \WP\MCP\Core\McpAdapter::instance();
    }
);

/**
 * Register abilities once the Abilities API is ready.
 */
add_action(
    'wp_abilities_api_init',
    function () {
        require_once A2B_COMPANION_DIR . 'abilities/block-introspection.php';
        require_once A2B_COMPANION_DIR . 'abilities/pattern-introspection.php';
        require_once A2B_COMPANION_DIR . 'abilities/template-introspection.php';

        a2b_register_block_introspection_ability();
        a2b_register_pattern_introspection_ability();
        a2b_register_template_introspection_ability();
    }
);
