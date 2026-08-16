<?php
/**
 * Template introspection ability — exposes registered block templates via MCP.
 *
 * @package A2BCompanion
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Register the template introspection ability.
 */
function a2b_register_template_introspection_ability(): void {
    wp_register_ability(
        'a2b/get-block-templates',
        array(
            'label'             => __( 'Get Block Templates', 'a2b-companion' ),
            'description'       => __( 'Retrieve all registered block templates and template parts with their names, titles, types, areas, and content markup.', 'a2b-companion' ),
            'category'          => 'site',
            'input_schema'      => array(
                'type'       => 'object',
                'properties' => array(
                    'type' => array(
                        'type'        => 'string',
                        'description' => 'Filter by template type: "wp_template" or "wp_template_part". Omit for both.',
                        'enum'        => array( 'wp_template', 'wp_template_part' ),
                    ),
                ),
            ),
            'output_schema'     => array(
                'type'  => 'array',
                'items' => array(
                    'type'       => 'object',
                    'properties' => array(
                        'slug'        => array( 'type' => 'string' ),
                        'title'       => array( 'type' => 'string' ),
                        'type'        => array( 'type' => 'string' ),
                        'area'        => array( 'type' => 'string' ),
                        'description' => array( 'type' => 'string' ),
                        'content'     => array( 'type' => 'string' ),
                    ),
                ),
            ),
            'execute_callback'  => 'a2b_get_block_templates',
            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },
            'meta'              => array(
                'public' => true,
            ),
        )
    );
}

/**
 * Execute callback: return all registered block templates and template parts.
 *
 * @param array $input Input arguments.
 * @return array
 */
function a2b_get_block_templates( array $input ): array {
    $filter_type = $input['type'] ?? '';
    $result      = array();

    $types = $filter_type ? array( $filter_type ) : array( 'wp_template', 'wp_template_part' );

    foreach ( $types as $type ) {
        $templates = get_block_templates( array(), $type );
        foreach ( $templates as $template ) {
            $result[] = array(
                'slug'        => $template->slug ?? '',
                'title'       => $template->title ?? '',
                'type'        => $type,
                'area'        => $template->area ?? '',
                'description' => $template->description ?? '',
                'content'     => is_string( $template->content ) ? $template->content : '',
            );
        }
    }

    return $result;
}